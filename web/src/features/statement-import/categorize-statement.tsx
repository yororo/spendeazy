import { compareStatementRows, isStatementSort, type CategorizeView, type StatementSort } from "./statement-review-order";
import { hasSameRulePattern, matchesRuleDescription } from "./category-rule-matching";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ActiveSpaceLabel, capturePageScroll, restorePageScroll } from "@/shared/ui";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleMinusIcon,
  CirclePlusIcon,
  FilterIcon,
  LandmarkIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCategoryColorClass,
  getDefaultCategoryColor,
  type CategoryColor,
} from "@/shared/category";
import { formatMoney } from "@/shared/money";

import { ImportProgress } from "./import-progress";
import { BulkCategoryPreview } from "./bulk-category-preview";
import {
  formatImportDate,
  formatTransactionHistoryPeriod,
} from "./statement-import-date-formatting";
import { formatStatementType } from "./statement-type";
import {
  type CategoryCatalogOption,
  type CategoryColorOption,
  type CategoryRule,
  type CategorySuggestionFetcher,
} from "./statement-import-service";
import {
  getCategoryLabel,
  getStatementActivityLabel,
  isIncludedStatementTransaction,
  normalizeDescription,
  toDateInputValue,
} from "./statement-import-utils";
import type {
  CategorizedStatement,
  CategorizedTransaction,
} from "./statement-categorizer";
import { AssignmentBadge, CategoryMatchCell } from "./statement-category-match";
import type {
  CategorizeEditorState,
  TransactionDraft,
} from "./statement-import-workflow";
import {
  useStatementCategorySuggestions,
  type CategorySuggestionState,
} from "./use-statement-category-suggestions";

type CategoryFilter = "all" | "unmapped" | string;
type CategorySuggestionFeedback = "loading" | "none" | "unavailable" | null;
const MOBILE_EDITOR_BREAKPOINT_PX = 768;

interface CategorizeStatementProps {
  initialView?: CategorizeView | null;
  onCaptureView?: (view: CategorizeView) => void;
  categoryOptions: readonly CategoryColorOption[];
  categoryLabels: readonly CategoryCatalogOption[];
  categoryRules: readonly CategoryRule[];
  destinationLabel?: string;
  spaceId?: string;
  getCategorySuggestion?: CategorySuggestionFetcher;
  fileName: string;
  statementSummary: CategorizedStatement["summary"];
  transactions: readonly CategorizedTransaction[];
  editor: CategorizeEditorState;
  canReview: boolean;
  onBeginEdit: (transactionId: string) => boolean;
  onCancelEdit: () => boolean;
  onChangeDraft: (draft: TransactionDraft) => boolean;
  onChangeDescription: (description: string) => boolean;
  onChangeRememberRule: (checked: boolean) => boolean;
  onChangeRememberedMatchType: (
    matchType: CategoryRule["matchType"],
  ) => boolean;
  onChangeRememberedPattern: (pattern: string) => boolean;
  onSaveEdit: () => Promise<readonly CategorizedTransaction[] | null>;
  onToggleTransactionExclusion: (transactionId: string) => boolean;
  onApplyBulkCategory: (sourceId: string, selectedIds: readonly string[], categoryId: string) => boolean;
  onBack: () => void;
  onReview: () => void;
}

function CategorizeStatement({
  initialView,
  onCaptureView,
  categoryOptions,
  categoryLabels,
  categoryRules,
  destinationLabel,
  spaceId,
  getCategorySuggestion,
  fileName,
  statementSummary,
  transactions,
  editor,
  canReview,
  onBeginEdit,
  onCancelEdit,
  onChangeDraft,
  onChangeDescription,
  onChangeRememberRule,
  onChangeRememberedMatchType,
  onChangeRememberedPattern,
  onSaveEdit,
  onToggleTransactionExclusion,
  onApplyBulkCategory,
  onBack,
  onReview,
}: CategorizeStatementProps) {
  const [search, setSearch] = useState(initialView?.search ?? "");
  const [dateFrom, setDateFrom] = useState(initialView?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialView?.dateTo ?? "");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(initialView?.categoryFilter ?? "all");
  const [sort, setSort] = useState<StatementSort>(initialView?.sort ?? "date-desc");
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!initialView) return;
    const frame = requestAnimationFrame(() => {
      reviewButtonRef.current?.focus({ preventScroll: true });
      restorePageScroll(initialView);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialView]);
  const completionRef = useRef<HTMLParagraphElement>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [mobileEditorFocus, setMobileEditorFocus] = useState<
    "category" | "details"
  >("details");
  const {
    draft,
    draftError,
    editingId,
    isSaving,
    rememberedMatchType,
    rememberedPattern,
    rememberRule,
  } = editor;
  const isEditing = editingId !== null;
  const editingTransaction = transactions.find(
    (transaction) => transaction.id === editingId,
  );
  const canRequestEditingSuggestion = Boolean(
    getCategorySuggestion &&
      spaceId &&
      draft &&
      editingTransaction?.assignment === "unmapped" &&
      isIncludedStatementTransaction(editingTransaction) &&
      draft.category.trim().length === 0 &&
      draft.description.trim().length > 0,
  );
  const { results: categorySuggestionResults, isAvailable: suggestionsAvailable } =
    useStatementCategorySuggestions({
      transactions,
      editingTransaction,
      editingDescription: canRequestEditingSuggestion ? draft?.description ?? null : null,
      categoryOptions,
      categoryLabels,
      spaceId,
      getCategorySuggestion,
    });
  const editingDescriptionKey = canRequestEditingSuggestion
    ? normalizeDescription(draft?.description ?? "")
    : "";
  const categorySuggestionResult: CategorySuggestionState | null =
    editingDescriptionKey && suggestionsAvailable
      ? categorySuggestionResults.get(editingDescriptionKey) ?? {
          status: "loading",
        }
      : null;
  const currentCategorySuggestions =
    categorySuggestionResult?.status === "suggested"
      ? categorySuggestionResult.suggestions
      : [];
  const suggestedCategories = currentCategorySuggestions.flatMap(
    (suggestion) => {
      const category = categoryOptions.find(
        (option) => option.value === suggestion.categoryId,
      );
      return category ? [category] : [];
    },
  );
  const categorySuggestionFeedback: CategorySuggestionFeedback =
    !categorySuggestionResult
      ? null
      : categorySuggestionResult.status === "loading"
        ? "loading"
        : categorySuggestionResult.status === "unavailable"
          ? "unavailable"
          : categorySuggestionResult.status === "none" ||
              (categorySuggestionResult.status === "suggested" &&
                suggestedCategories.length === 0)
            ? "none"
            : null;
  function currentCategorySuggestionCount(transaction: CategorizedTransaction) {
    if (
      transaction.assignment !== "unmapped" ||
      !isIncludedStatementTransaction(transaction)
    ) {
      return 0;
    }

    const result = categorySuggestionResults.get(
      normalizeDescription(transaction.description),
    );
    return result?.status === "suggested"
      ? result.suggestions.filter((suggestion) =>
          categoryOptions.some((option) => option.value === suggestion.categoryId),
        ).length
      : 0;
  }
  const getCategoryLabelForTransaction = (categoryId: string) =>
    getCategoryLabel(categoryLabels, categoryId);

  useEffect(() => {
    if (!isEditing) return;

    function syncEditorForViewport() {
      setMobileEditorOpen(window.innerWidth < MOBILE_EDITOR_BREAKPOINT_PX);
    }

    window.addEventListener("resize", syncEditorForViewport);
    return () => window.removeEventListener("resize", syncEditorForViewport);
  }, [isEditing]);
  const hasActiveFilters =
    search.trim().length > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0 ||
    categoryFilter !== "all";
  const hasActiveSheetFilters =
    dateFrom.length > 0 || dateTo.length > 0 || categoryFilter !== "all";
  const includedTransactions = transactions.filter(
    isIncludedStatementTransaction,
  );
  const ruleCount = includedTransactions.filter(
    (transaction) =>
      transaction.categoryId !== null && transaction.assignment === "rule",
  ).length;
  const manualCount = includedTransactions.filter(
    (transaction) =>
      transaction.categoryId !== null && transaction.assignment === "manual",
  ).length;
  const unmappedCount = includedTransactions.filter(
    (transaction) => transaction.categoryId === null,
  ).length;
  const ambiguousCount = includedTransactions.filter(
    (transaction) => transaction.assignment === "ambiguous",
  ).length;
  const excludedCount = transactions.length - includedTransactions.length;
  const isEWallet = statementSummary.statementType === "e_wallet";
  const statementHistoryPeriod = formatTransactionHistoryPeriod(
    statementSummary.transactionHistoryStartDate,
    statementSummary.statementDate,
  );

  const visibleTransactions = useMemo(() => {
    const normalizedSearch = normalizeDescription(search);

    return transactions
      .filter((transaction) => {
        const transactionDate = toDateInputValue(transaction.transactionDate);
        const matchesSearch =
          !normalizedSearch ||
          normalizeDescription(transaction.description).includes(
            normalizedSearch,
          );
        const matchesStart = !dateFrom || transactionDate >= dateFrom;
        const matchesEnd = !dateTo || transactionDate <= dateTo;
        const matchesCategory =
          categoryFilter === "all" ||
          (categoryFilter === "unmapped"
            ? transaction.categoryId === null
            : transaction.categoryId === categoryFilter);

        return matchesSearch && matchesStart && matchesEnd && matchesCategory;
      })
      .sort((a, b) => compareStatementRows(a, b, sort));
  }, [categoryFilter, dateFrom, dateTo, search, sort, transactions]);
  const editingTransactionIsVisible = visibleTransactions.some(
    (transaction) => transaction.id === editingId,
  );

  function getCategoryColor(categoryId: string): CategoryColor {
    return (
      categoryLabels.find((option) => option.value === categoryId)?.color ??
      getDefaultCategoryColor(categoryId)
    );
  }

  const equivalentRule = categoryRules.some((rule) =>
    rule.categoryId === draft?.category && hasSameRulePattern(rule, { matchType: rememberedMatchType, pattern: rememberedPattern }),
  );
  const normalizedRulePattern = normalizeDescription(rememberedPattern);
  const previewRows = normalizedRulePattern ? transactions.filter((transaction) => {
    const description = transaction.id === editingId ? draft?.description ?? transaction.description : transaction.description;
    return matchesRuleDescription(description, { matchType: rememberedMatchType, pattern: rememberedPattern });
  }) : [];

  async function saveAssignment() {
    const remembering = rememberRule;
    const saved = await onSaveEdit();
    if (saved && remembering) setAssignmentFeedback("Category Rule saved for future imports. This statement still needs Review and confirmation.");
    return saved;
  }

  async function applyWithoutRemembering() {
    if (onChangeRememberRule(false)) await onSaveEdit();
  }

  const ruleHelp = (layout: "mobile" | "table") => <div className="grid min-w-0 gap-2 text-sm">
    <p>{equivalentRule
      ? "An equivalent Rule already remembers this Category for future imports."
      : "Remember to categorize matching descriptions in future imports. Rules are saved immediately, before this import is confirmed."}</p>
    {rememberRule && <>
      <p>{rememberedMatchType === "exact"
        ? "Exact matches the entire description, ignoring case and repeated whitespace."
        : "Contains matches anywhere in a description, even within a word. Punctuation matters. Exact Rules take precedence."}</p>
      <p>{previewRows.length} matching {previewRows.length === 1 ? "row" : "rows"} in this statement</p>
      <ul className="max-h-32 overflow-y-auto wrap-anywhere">
        {previewRows.map((row) => <li key={row.id}>{row.id === editingId ? draft?.description : row.description}{row.isExcluded ? " · Excluded" : row.categoryId ? " · Reviewed assignment retained" : " · Unmapped; existing Rule precedence applies"}</li>)}
      </ul>
      <p>Preview shows description matches only. Other reviewed assignments remain unchanged.</p>
      {draftError && <p>The save may have completed if the connection was lost. Retry safely reuses an equivalent Rule. Applying without remembering does not undo a Rule already saved.</p>}
      <div className="flex flex-wrap gap-2">
        {(draftError || layout === "table") && <Button type="button" disabled={isSaving} onClick={saveAssignment}>{draftError ? "Retry" : "Apply & remember"}</Button>}
        {draftError && <Button type="button" variant="outline" disabled={isSaving} onClick={applyWithoutRemembering}>Apply without remembering</Button>}
      </div>
    </>}
  </div>;

  async function applyAndNext() {
    const rememberedFeedback = rememberRule ? "Category Rule saved for future imports. " : "";
    const orderedIds = visibleTransactions.map((transaction) => transaction.id);
    const currentIndex = orderedIds.indexOf(editingId ?? "");
    const candidateIds = [
      ...orderedIds.slice(currentIndex + 1),
      ...orderedIds.slice(0, currentIndex),
    ];
    const savedTransactions = await saveAssignment();
    if (!savedTransactions) return;
    const remainingIds = new Set(savedTransactions
      .filter((transaction) =>
        isIncludedStatementTransaction(transaction) && transaction.categoryId === null,
      )
      .map((transaction) => transaction.id));
    const nextId = candidateIds.find((id) => remainingIds.has(id));
    if (nextId && onBeginEdit(nextId)) {
      setMobileEditorFocus("category");
      setMobileEditorOpen(
        mobileEditorOpen || window.innerWidth < MOBILE_EDITOR_BREAKPOINT_PX,
      );
    } else {
      setMobileEditorOpen(false);
      setAssignmentFeedback(rememberedFeedback + (remainingIds.size > 0
        ? "All visible expenses have a Category. Adjust filters to find remaining Unmapped expenses."
        : "All included expenses have a Category. Continue to Review when ready."));
    }
  }

  function toggleTransactionExclusion(transactionId: string) {
    if (onToggleTransactionExclusion(transactionId)) setAssignmentFeedback(null);
  }

  function changeSort(value: string) {
    if (isStatementSort(value)) setSort(value);
  }

  function clearFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setCategoryFilter("all");
  }

  function advanceToReview() {
    onCaptureView?.({
      search, dateFrom, dateTo, categoryFilter, sort,
      ...capturePageScroll(),
    });
    onReview();
  }

  function returnToUpload() {
    onBack();
  }

  function beginDesktopEditing(transactionId: string) {
    if (onBeginEdit(transactionId)) {
      setAssignmentFeedback(null);
      setMobileEditorFocus("details");
      setMobileEditorOpen(false);
    }
  }

  function beginMobileEditing(
    transactionId: string,
    focus: "category" | "details" = "details",
  ) {
    if (onBeginEdit(transactionId)) {
      setAssignmentFeedback(null);
      setMobileEditorFocus(focus);
      setMobileEditorOpen(true);
    }
  }

  function cancelEditing() {
    if (onCancelEdit()) {
      setMobileEditorOpen(false);
    }
  }

  function closeMobileEditor() {
    cancelEditing();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:min-h-screen lg:px-9 lg:py-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <ActiveSpaceLabel spaceId={spaceId} />
          <p className="text-label text-muted-foreground">
            Imports / Categorize
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight md:text-3xl">
            Categorize and update
          </h1>
          {destinationLabel && (
            <p className="mt-2 font-mono text-xs font-semibold uppercase text-muted-foreground">
              Destination: {destinationLabel}
            </p>
          )}
        </div>
        <ImportProgress
          currentStep="Categorize"
          className="max-md:!w-full max-md:[&>li]:min-h-13 max-md:[&>li]:!flex-1 max-md:[&>li]:flex-col max-md:[&>li]:gap-0.5 max-md:[&>li]:px-2"
        />
      </header>

      {isSaving && (
        <p
          role="status"
          aria-live="polite"
          className="font-mono text-sm font-semibold"
        >
          Saving…
        </p>
      )}
      {draftError && !mobileEditorOpen && !editingTransactionIsVisible && (
        <p role="alert" className="font-medium text-destructive">
          {draftError}
        </p>
      )}

      {assignmentFeedback && (
        <p ref={completionRef} tabIndex={-1} role="status" aria-live="polite">
          {assignmentFeedback}
        </p>
      )}

      <main className="flex flex-1 flex-col gap-4">
        <section
          className="border border-foreground md:hidden"
          aria-label="Parsed statement summary"
        >
          <div className="bg-primary p-4 text-primary-foreground">
            <p className="text-label">Parsed statement / Categorize</p>
            <p className="mt-1 text-base font-bold wrap-anywhere">
              {statementSummary.provider}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold uppercase wrap-anywhere">
              {isEWallet &&
                `${formatStatementType(statementSummary.statementType)} · `}
              {statementSummary.accountType} · {fileName}
            </p>
          </div>
          <div className="grid grid-cols-3 border-t border-foreground">
            <MobileSummaryMetric
              label={isEWallet ? "Transaction History Period" : "Date"}
            >
              {isEWallet
                ? statementHistoryPeriod
                : formatImportDate(statementSummary.statementDate)}
            </MobileSummaryMetric>
            <MobileSummaryMetric label={isEWallet ? "Total Debit" : "Amount"}>
              {formatMoney(
                isEWallet
                  ? (statementSummary.totalDebit ?? 0)
                  : statementSummary.totalAmountDue,
              )}
            </MobileSummaryMetric>
            <MobileSummaryMetric label="Rows">
              {transactions.length}
            </MobileSummaryMetric>
          </div>
        </section>

        <section
          className="hidden border border-foreground md:grid md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(10rem,0.45fr))]"
          aria-label="Parsed statement summary"
        >
          <div className="flex min-h-28 items-center gap-3 border-b border-foreground bg-primary p-4 text-primary-foreground sm:col-span-2 xl:col-span-1 xl:border-r xl:border-b-0">
            <span className="grid size-10 shrink-0 place-content-center bg-secondary text-primary">
              <LandmarkIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-label">Parsed statement / Categorize</p>
              <p className="mt-1 truncate text-base font-bold">
                {statementSummary.provider}
              </p>
              <p className="truncate font-mono text-xs font-semibold uppercase">
                {isEWallet &&
                  `${formatStatementType(statementSummary.statementType)} · `}
                {statementSummary.accountType} · {fileName}
              </p>
            </div>
          </div>

          <SummaryMetric
            label={isEWallet ? "Transaction History Period" : "Statement date"}
          >
            {isEWallet
              ? statementHistoryPeriod
              : formatImportDate(statementSummary.statementDate)}
          </SummaryMetric>
          <SummaryMetric
            label={isEWallet ? "Total Debit" : "Statement Amount"}
            emphasized
          >
            {formatMoney(
              isEWallet
                ? (statementSummary.totalDebit ?? 0)
                : statementSummary.totalAmountDue,
            )}
          </SummaryMetric>
          <SummaryMetric label="Transactions parsed">
            {transactions.length}
          </SummaryMetric>
        </section>

        <section
          className="border border-foreground"
          aria-labelledby="transactions-heading"
        >
          <div className="flex gap-2 border-b p-3 md:hidden">
            <div className="relative min-w-0 flex-1">
              <Label htmlFor="mobile-transaction-search" className="sr-only">
                Search descriptions
              </Label>
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="mobile-transaction-search"
                aria-label="Search Transactions"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search description"
                className="h-11 border-foreground pl-9"
              />
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="relative size-11 border-foreground"
                  aria-label={
                    hasActiveSheetFilters
                      ? "Filter Transactions, filters active"
                      : "Filter Transactions"
                  }
                >
                  <FilterIcon aria-hidden="true" />
                  {hasActiveFilters && (
                    <span
                      className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-1 ring-foreground"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full max-w-sm flex-col overflow-y-auto p-0"
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <SheetHeader className="border-b p-5 pr-14">
                  <SheetTitle>Filter Transactions</SheetTitle>
                  <SheetDescription>
                    Results update immediately as filters change.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 p-5">
                  <div>
                    <Label htmlFor="mobile-transaction-date-from">From</Label>
                    <DateInput
                      id="mobile-transaction-date-from"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                      className="mt-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mobile-transaction-date-to">To</Label>
                    <DateInput
                      id="mobile-transaction-date-to"
                      value={dateTo}
                      onChange={(event) => setDateTo(event.target.value)}
                      className="mt-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mobile-transaction-category-filter">
                      Category
                    </Label>
                    <Select
                      value={categoryFilter}
                      onValueChange={setCategoryFilter}
                    >
                      <SelectTrigger
                        id="mobile-transaction-category-filter"
                        className="mt-1.5"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="unmapped">Unmapped</SelectItem>
                        {categoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <span className="inline-flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={`size-2 shrink-0 ${getCategoryColorClass(option.color)}`}
                              />
                              {option.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="mobile-transaction-sort">Sort by</Label>
                    <Select value={sort} onValueChange={changeSort}>
                      <SelectTrigger
                        id="mobile-transaction-sort"
                        className="mt-1.5"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date-desc">
                          Date: newest first
                        </SelectItem>
                        <SelectItem value="date-asc">
                          Date: oldest first
                        </SelectItem>
                        <SelectItem value="amount-desc">
                          Amount: highest first
                        </SelectItem>
                        <SelectItem value="amount-asc">
                          Amount: lowest first
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearFilters}
                    disabled={!hasActiveSheetFilters}
                  >
                    Clear filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="hidden gap-3 border-b p-3 md:grid md:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_10.5rem_10.5rem_12rem_12rem_auto] lg:items-end">
            <div>
              <Label htmlFor="transaction-search">Search descriptions</Label>
              <div className="relative mt-1.5">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="transaction-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search transaction description…"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="transaction-date-from">From</Label>
              <DateInput
                id="transaction-date-from"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="transaction-date-to">To</Label>
              <DateInput
                id="transaction-date-to"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="transaction-category-filter">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger
                  id="transaction-category-filter"
                  className="mt-1.5"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="unmapped">Unmapped</SelectItem>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 ${getCategoryColorClass(option.color)}`}
                        />
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="transaction-sort">Sort by</Label>
              <Select value={sort} onValueChange={changeSort}>
                <SelectTrigger id="transaction-sort" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Date: newest first</SelectItem>
                  <SelectItem value="date-asc">Date: oldest first</SelectItem>
                  <SelectItem value="amount-desc">
                    Amount: highest first
                  </SelectItem>
                  <SelectItem value="amount-asc">
                    Amount: lowest first
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
            >
              Clear filters
            </Button>
          </div>

          <div className="border-b bg-secondary px-3 py-2 text-secondary-foreground md:hidden">
            <div className="flex items-center justify-between gap-3 font-mono text-xs font-bold uppercase">
              <span>
                {visibleTransactions.length} of {transactions.length}{" "}
                Transactions
              </span>
              <span className={unmappedCount > 0 ? "text-primary" : undefined}>
                {unmappedCount} need Review
              </span>
            </div>
            {(ruleCount > 0 ||
              manualCount > 0 ||
              ambiguousCount > 0 ||
              excludedCount > 0 ||
              categoryRules.length > 0) && (
              <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-xs text-muted">
                {ruleCount > 0 && <span>{ruleCount} Rule</span>}
                {manualCount > 0 && <span>{manualCount} Manual</span>}
                {ambiguousCount > 0 && <span>{ambiguousCount} Ambiguous</span>}
                {excludedCount > 0 && <span>{excludedCount} Excluded</span>}
                {categoryRules.length > 0 && (
                  <span>{categoryRules.length} persisted Rules</span>
                )}
              </p>
            )}
          </div>

          <div className="hidden flex-col gap-1 border-b bg-muted px-3 py-2 md:flex sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="transactions-heading" className="text-label">
                Parsed Transactions
              </h2>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground uppercase">
                {visibleTransactions.length} of {transactions.length}{" "}
                Transactions
              </p>
            </div>
            <p className="font-mono text-xs font-semibold uppercase">
              <span className="text-success">{ruleCount} Rule</span>
              {manualCount > 0 && <> · {manualCount} Manual</>}
              {" · "}
              <span className="text-warning">{unmappedCount} Unmapped</span>
              {ambiguousCount > 0 && (
                <>
                  {" · "}
                  <span className="text-warning">
                    {ambiguousCount} Ambiguous
                  </span>
                </>
              )}
              {excludedCount > 0 && <> · {excludedCount} Excluded</>}
              {categoryRules.length > 0 && (
                <> · {categoryRules.length} persisted Rules</>
              )}
            </p>
          </div>

          <div className="md:hidden">
            {visibleTransactions.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-mono text-sm font-bold uppercase">
                  No Transactions match
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adjust or clear the active filters to see parsed Transactions.
                </p>
              </div>
            ) : (
              <ul className="divide-y" aria-label="Transactions to categorize">
                {visibleTransactions.map((transaction) => {
                  const suggestionCount = currentCategorySuggestionCount(transaction);
                  return (
                    <li
                      key={transaction.id}
                      className={`space-y-2.5 px-4 py-3 ${
                        transaction.isExcluded
                          ? "bg-muted/70 text-muted-foreground"
                          : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <p className="min-w-0 flex-1 font-semibold wrap-anywhere">
                          {transaction.description}
                        </p>
                        <p className="max-w-1/2 shrink-0 text-right font-mono text-sm font-bold tabular-nums wrap-anywhere">
                          {formatMoney(Math.abs(transaction.amount))}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10"
                          onClick={() => beginMobileEditing(transaction.id)}
                          disabled={isEditing || transaction.isExcluded}
                          aria-label={`Edit ${transaction.description}`}
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">
                          {formatImportDate(transaction.transactionDate)}
                        </p>
                        <AssignmentBadge assignment={transaction.assignment} />
                        {transaction.amount > 0 && <Badge variant="muted">{getStatementActivityLabel(transaction)}</Badge>}
                        {transaction.isExcluded && <Badge variant="muted">Excluded</Badge>}
                      </div>

                      <BulkCategoryPreview
                        source={transaction}
                        transactions={transactions}
                        categoryOptions={categoryOptions}
                        categoryLabels={categoryLabels}
                        disabled={isEditing}
                        onApply={onApplyBulkCategory}
                      />
                      <div className="flex items-stretch gap-2">
                        <button
                          type="button"
                          className="focus-ledger flex min-h-10 min-w-0 flex-1 items-center justify-between gap-2 border border-input bg-muted px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => beginMobileEditing(transaction.id, "category")}
                          disabled={isEditing || transaction.isExcluded}
                          aria-label={`Edit Category for ${transaction.description}${suggestionCount > 0 ? `, ${suggestionCount} ${suggestionCount === 1 ? "suggestion" : "suggestions"} available` : ""}`}
                        >
                          <span className="min-w-0 whitespace-normal wrap-anywhere">
                            {transaction.assignment === "unmapped" ? (
                              <span className="inline-flex items-center gap-2 font-medium text-warning">
                                <TagIcon className="size-4 shrink-0" aria-hidden="true" />
                                Choose category
                              </span>
                            ) : (
                              <CategoryMatchCell
                                assignment={transaction.assignment}
                                categoryId={transaction.categoryId}
                                getCategoryLabel={getCategoryLabelForTransaction}
                                getCategoryColor={getCategoryColor}
                                matchedCategoryIds={transaction.matchedCategoryIds}
                              />
                            )}
                          </span>
                          {suggestionCount > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-semibold text-success">
                              <SparklesIcon className="size-4" aria-hidden="true" />
                              {suggestionCount} {suggestionCount === 1 ? "suggestion" : "suggestions"}
                            </span>
                          )}
                        </button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className={`size-10 ${
                            transaction.isExcluded
                              ? "text-success hover:text-success"
                              : "text-destructive hover:text-destructive"
                          }`}
                          onClick={() =>
                            toggleTransactionExclusion(transaction.id)
                          }
                          disabled={isEditing || transaction.amount > 0}
                          aria-label={
                            transaction.amount > 0
                              ? `${getStatementActivityLabel(transaction)} ${transaction.description} is permanently excluded`
                              : `${transaction.isExcluded ? "Include" : "Exclude"} ${transaction.description}`
                          }
                        >
                          {transaction.isExcluded ? (
                            <CirclePlusIcon aria-hidden="true" />
                          ) : (
                            <CircleMinusIcon aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="hidden md:block">
            <Table className="min-w-[64rem]">
              <TableCaption className="sr-only">
                Transactions parsed from {fileName}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-40 text-right">Amount</TableHead>
                  <TableHead className="w-52">Category</TableHead>
                  <TableHead className="w-28 text-center">Assignment</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center whitespace-normal"
                    >
                      <p className="font-mono text-sm font-bold uppercase">
                        No Transactions match
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Adjust or clear the active filters to see parsed
                        Transactions.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleTransactions.map((transaction) => {
                    const isCurrentEdit =
                      transaction.id === editingId && !mobileEditorOpen;
                    if (isCurrentEdit && draft) {
                      return (
                        <TransactionEditRows
                          key={transaction.id}
                          categoryOptions={categoryOptions}
                          suggestedCategories={suggestedCategories}
                          categorySuggestionFeedback={
                            categorySuggestionFeedback
                          }
                          transaction={transaction}
                          draft={draft}
                          error={draftError}
                          ruleHelp={ruleHelp("table")}
                          rememberRule={rememberRule}
                          rememberedMatchType={rememberedMatchType}
                          rememberedPattern={rememberedPattern}
                          isSaving={isSaving}
                          onDraftChange={onChangeDraft}
                          onUseSuggestedCategory={(categoryId) =>
                            onChangeDraft({ ...draft, category: categoryId })
                          }
                          onDescriptionChange={onChangeDescription}
                          onRememberRuleChange={onChangeRememberRule}
                          onRememberedMatchTypeChange={
                            onChangeRememberedMatchType
                          }
                          onRememberedPatternChange={onChangeRememberedPattern}
                          focusCategoryInitially={mobileEditorFocus === "category"}
                          onApplyAndNext={applyAndNext}
                          onSave={saveAssignment}
                          onCancel={cancelEditing}
                        />
                      );
                    }

                    return (
                      <TableRow
                        key={transaction.id}
                        className={
                          transaction.isExcluded
                            ? "bg-muted/70 text-muted-foreground hover:bg-muted"
                            : undefined
                        }
                      >
                        <TableCell className="font-mono text-xs font-semibold tabular-nums uppercase">
                          {formatImportDate(transaction.transactionDate)}
                        </TableCell>
                        <TableCell className="font-medium whitespace-normal">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{transaction.description}</span>
                            {transaction.amount > 0 && (
                              <Badge variant="muted">{getStatementActivityLabel(transaction)}</Badge>
                            )}
                            {transaction.isExcluded && (
                              <Badge variant="muted">Excluded</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold tabular-nums">
                          {formatMoney(Math.abs(transaction.amount))}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <CategoryMatchCell
                              assignment={transaction.assignment}
                              categoryId={transaction.categoryId}
                              getCategoryLabel={getCategoryLabelForTransaction}
                              getCategoryColor={getCategoryColor}
                              matchedCategoryIds={transaction.matchedCategoryIds}
                            />
                            {currentCategorySuggestionCount(transaction) > 0 && (
                              <CategorySuggestionCue
                                description={transaction.description}
                                disabled={isEditing}
                                className="h-8 justify-start px-2 text-left"
                                onActivate={() =>
                                  beginDesktopEditing(transaction.id)
                                }
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {transaction.assignment !== "unmapped" && (
                            <AssignmentBadge
                              assignment={transaction.assignment}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <BulkCategoryPreview
                              source={transaction}
                              transactions={transactions}
                              categoryOptions={categoryOptions}
                              categoryLabels={categoryLabels}
                              disabled={isEditing}
                              onApply={onApplyBulkCategory}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                beginDesktopEditing(transaction.id)
                              }
                              disabled={isEditing || transaction.isExcluded}
                              aria-label={`Edit ${transaction.description}`}
                            >
                              <PencilIcon aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className={
                                transaction.isExcluded
                                  ? "text-success hover:text-success"
                                  : "text-destructive hover:text-destructive"
                              }
                              onClick={() =>
                                toggleTransactionExclusion(transaction.id)
                              }
                              disabled={isEditing || transaction.amount > 0}
                              aria-label={
                                transaction.amount > 0
                                  ? `${getStatementActivityLabel(transaction)} ${transaction.description} is permanently excluded`
                                  : `${transaction.isExcluded ? "Include" : "Exclude"} ${transaction.description}`
                              }
                            >
                              {transaction.isExcluded ? (
                                <CirclePlusIcon aria-hidden="true" />
                              ) : (
                                <CircleMinusIcon aria-hidden="true" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Let users reach search and navigation while persistence is pending. */}
          <Dialog
            open={mobileEditorOpen && isEditing}
            modal={!isSaving}
            onOpenChange={(open) => {
              if (!open) closeMobileEditor();
            }}
          >
            {editingTransaction && draft && (
              <DialogContent
                className="md:hidden"
                closeButtonDisabled={isSaving}
                onCloseAutoFocus={(event) => {
                  if (completionRef.current) {
                    event.preventDefault();
                    completionRef.current.focus();
                  }
                }}
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  if (event.currentTarget instanceof HTMLElement) {
                    const focusTarget =
                      mobileEditorFocus === "category"
                        ? event.currentTarget.querySelector<HTMLElement>(
                            `#mobile-transaction-${editingTransaction.id}-category`,
                          )
                        : null;
                    (focusTarget ?? event.currentTarget).focus();
                  }
                }}
                onEscapeKeyDown={(event) => {
                  if (isSaving) event.preventDefault();
                }}
              >
                <DialogHeader>
                  <DialogTitle>Edit Transaction</DialogTitle>
                  <DialogDescription className="wrap-anywhere">
                    Update {editingTransaction.description} and choose its
                    Category.
                  </DialogDescription>
                </DialogHeader>
                <MobileTransactionEditor
                  key={editingTransaction.id}
                  onApplyAndNext={applyAndNext}
                  categoryOptions={categoryOptions}
                  suggestedCategories={suggestedCategories}
                  categorySuggestionFeedback={categorySuggestionFeedback}
                  focusCategoryInitially={mobileEditorFocus === "category"}
                  onToggleCorrections={() => setMobileEditorFocus(
                    mobileEditorFocus === "category" ? "details" : "category",
                  )}
                  transaction={editingTransaction}
                  draft={draft}
                  error={draftError}
                          ruleHelp={ruleHelp("mobile")}
                  rememberRule={rememberRule}
                  rememberedMatchType={rememberedMatchType}
                  rememberedPattern={rememberedPattern}
                  isSaving={isSaving}
                  onDraftChange={onChangeDraft}
                  onUseSuggestedCategory={(categoryId) =>
                    onChangeDraft({ ...draft, category: categoryId })
                  }
                  onDescriptionChange={onChangeDescription}
                  onRememberRuleChange={onChangeRememberRule}
                  onRememberedMatchTypeChange={onChangeRememberedMatchType}
                  onRememberedPatternChange={onChangeRememberedPattern}
                  onSave={saveAssignment}
                  onCancel={closeMobileEditor}
                />
              </DialogContent>
            )}
          </Dialog>
        </section>

        {unmappedCount > 0 && (
          <div
            role="alert"
            className="border border-warning bg-warning-surface p-3 text-sm text-warning"
          >
            <p>
              {unmappedCount} included{" "}
              {unmappedCount === 1 ? "Transaction needs" : "Transactions need"}{" "}
              a Category before Review.
            </p>
            {ambiguousCount > 0 && (
              <p className="mt-1">
                {ambiguousCount}{" "}
                {ambiguousCount === 1 ? "Transaction has" : "Transactions have"}{" "}
                multiple categories matched. Choose a Category to resolve the
                ambiguity.
              </p>
            )}
          </div>
        )}

        <div className="mt-auto flex gap-2 border-t border-foreground pt-4 md:gap-3 md:flex-row md:items-center md:justify-between">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-13 px-0 md:h-10 md:w-auto md:px-4"
            onClick={returnToUpload}
            aria-label="Back to Upload"
          >
            <ArrowLeftIcon aria-hidden="true" />
            <span className="sr-only md:not-sr-only">Back to Upload</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-12 min-w-0 flex-1 md:h-10 md:flex-none"
            ref={reviewButtonRef}
            onClick={advanceToReview}
            disabled={!canReview}
          >
            Review {includedTransactions.length} Transactions
            <ArrowRightIcon className="text-primary" aria-hidden="true" />
          </Button>
        </div>
      </main>
    </div>
  );
}

interface SummaryMetricProps {
  label: string;
  children: React.ReactNode;
  emphasized?: boolean;
}

function MobileSummaryMetric({ label, children }: SummaryMetricProps) {
  return (
    <div className="min-w-0 border-r p-3 last:border-r-0">
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xs font-bold tabular-nums uppercase wrap-anywhere">
        {children}
      </p>
    </div>
  );
}

function SummaryMetric({ label, children, emphasized }: SummaryMetricProps) {
  return (
    <div className="flex min-h-24 flex-col justify-center border-b p-4 sm:border-r xl:border-b-0">
      <p className="text-label text-muted-foreground">{label}</p>
      <p
        className={`mt-2 font-mono text-xl font-bold tabular-nums ${emphasized ? "tracking-tight" : "uppercase"}`}
      >
        {children}
      </p>
    </div>
  );
}

function CategorySuggestionCue({
  description,
  disabled,
  className,
  onActivate,
}: {
  description: string;
  disabled: boolean;
  className?: string;
  onActivate: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={disabled}
      aria-label={`Suggestions available for ${description}`}
      onClick={onActivate}
    >
      <SparklesIcon aria-hidden="true" />
      Suggestions available
    </Button>
  );
}

function getCategorySuggestionFeedbackText(
  feedback: Exclude<CategorySuggestionFeedback, null>,
): string {
  switch (feedback) {
    case "loading":
      return "Checking for a Category Suggestion…";
    case "none":
      return "No Category Suggestion available. Choose a Category from the list.";
    case "unavailable":
      return "Category Suggestion unavailable. Choose a Category from the list.";
  }
}

interface TransactionEditRowsProps {
  readonly focusCategoryInitially?: boolean;
  categoryOptions: readonly CategoryColorOption[];
  suggestedCategories: readonly CategoryColorOption[];
  categorySuggestionFeedback: CategorySuggestionFeedback;
  transaction: CategorizedTransaction;
  draft: TransactionDraft;
  error: string | null;
  ruleHelp: ReactNode;
  rememberRule: boolean;
  isSaving: boolean;
  rememberedMatchType: CategoryRule["matchType"];
  rememberedPattern: string;
  onDraftChange: (draft: TransactionDraft) => void;
  onUseSuggestedCategory: (categoryId: string) => void;
  onDescriptionChange: (description: string) => void;
  onRememberRuleChange: (checked: boolean) => void;
  onRememberedMatchTypeChange: (matchType: CategoryRule["matchType"]) => void;
  onRememberedPatternChange: (pattern: string) => void;
  onApplyAndNext: () => void;
  onSave: () => void;
  onCancel: () => void;
}

interface TransactionDraftFieldsProps {
  readonly layout: "mobile" | "table";
  readonly compact?: boolean;
  readonly focusCategoryInitially?: boolean;
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly suggestedCategories: readonly CategoryColorOption[];
  readonly categorySuggestionFeedback: CategorySuggestionFeedback;
  readonly transaction: CategorizedTransaction;
  readonly draft: TransactionDraft;
  readonly isSaving: boolean;
  readonly errorId?: string;
  readonly onDraftChange: (draft: TransactionDraft) => void;
  readonly onUseSuggestedCategory: (categoryId: string) => void;
  readonly onDescriptionChange: (description: string) => void;
}

function TransactionDraftFields({
  layout,
  compact = false,
  focusCategoryInitially = false,
  categoryOptions,
  suggestedCategories,
  categorySuggestionFeedback,
  transaction,
  draft,
  isSaving,
  errorId,
  onDraftChange,
  onUseSuggestedCategory,
  onDescriptionChange,
}: TransactionDraftFieldsProps) {
  const idPrefix =
    layout === "mobile" ? `mobile-transaction-${transaction.id}` : undefined;
  const assignment = draft.category
    ? transaction.assignment === "rule" &&
      draft.category === transaction.categoryId
      ? "rule"
      : "manual"
    : "unmapped";
  const dateInput = (
    <DateInput
      id={idPrefix ? `${idPrefix}-date` : undefined}
      value={draft.date}
      autoFocus={layout === "table"}
      disabled={isSaving}
      onChange={(event) =>
        onDraftChange({ ...draft, date: event.target.value })
      }
      className={
        layout === "mobile"
          ? "mt-1.5 max-w-full font-mono text-xs"
          : "h-8 min-w-36 font-mono text-xs"
      }
      aria-label={`Date for ${transaction.description}`}
      aria-describedby={errorId}
    />
  );
  const descriptionInput = (
    <Input
      id={idPrefix ? `${idPrefix}-description` : undefined}
      value={draft.description}
      disabled={isSaving}
      onChange={(event) => onDescriptionChange(event.target.value)}
      className={layout === "mobile" ? "mt-1.5" : "h-8 min-w-56"}
      aria-label={`Description for ${transaction.description}`}
      aria-describedby={errorId}
    />
  );
  const amountInput = (
    <Input
      id={idPrefix ? `${idPrefix}-amount` : undefined}
      type="number"
      step="0.01"
      value={draft.amount}
      disabled={isSaving}
      onChange={(event) =>
        onDraftChange({ ...draft, amount: event.target.value })
      }
      className={
        layout === "mobile"
          ? "mt-1.5 font-mono tabular-nums"
          : "h-8 min-w-32 text-right font-mono tabular-nums"
      }
      aria-label={`Amount for ${transaction.description}`}
      aria-describedby={errorId}
    />
  );
  const categoryInput = (
    <Select
      value={draft.category}
      disabled={isSaving}
      onValueChange={(category) => onDraftChange({ ...draft, category })}
    >
      <SelectTrigger
        id={idPrefix ? `${idPrefix}-category` : undefined}
        className={layout === "mobile" ? "mt-1.5" : "h-8 min-w-40"}
        data-initial-focus={focusCategoryInitially ? "" : undefined}
        aria-label={`Category for ${transaction.description}`}
      >
        <SelectValue placeholder="Select Category" />
      </SelectTrigger>
      <SelectContent>
        {categoryOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 ${getCategoryColorClass(option.color)}`}
              />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const categorySuggestion = suggestedCategories.length > 0 ? (
    <div
      role="group"
      aria-label="Category Suggestions"
      className="flex flex-wrap items-start gap-1.5"
    >
      {suggestedCategories.map((suggestedCategory) => (
        <Button
          key={suggestedCategory.value}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-10 whitespace-normal text-left"
          disabled={isSaving}
          onClick={() => onUseSuggestedCategory(suggestedCategory.value)}
        >
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 ${getCategoryColorClass(suggestedCategory.color)}`}
          />
          Use suggested Category: {suggestedCategory.label}
        </Button>
      ))}
    </div>
  ) : categorySuggestionFeedback ? (
    <p
      role="status"
      aria-live="polite"
      className="text-xs text-muted-foreground"
    >
      {getCategorySuggestionFeedbackText(categorySuggestionFeedback)}
    </p>
  ) : null;

  if (layout === "table") {
    return (
      <>
        <TableCell>{dateInput}</TableCell>
        <TableCell>{descriptionInput}</TableCell>
        <TableCell>{amountInput}</TableCell>
        <TableCell>
          <div className="flex flex-col items-start gap-1.5">
            {categoryInput}
            {categorySuggestion}
          </div>
        </TableCell>
        <TableCell className="text-center">
          {assignment !== "unmapped" && (
            <AssignmentBadge assignment={assignment} />
          )}
        </TableCell>
      </>
    );
  }

  return (
    <>
      {!compact && (
        <>
          <div className="min-w-0">
            <Label htmlFor={`${idPrefix}-date`}>Date</Label>
            {dateInput}
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${idPrefix}-description`}>Description</Label>
            {descriptionInput}
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${idPrefix}-amount`}>Amount</Label>
            {amountInput}
          </div>
        </>
      )}
      <div className="min-w-0">
        <Label htmlFor={`${idPrefix}-category`}>Category</Label>
        {categoryInput}
        {categorySuggestion && <div className="mt-2">{categorySuggestion}</div>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <span className="text-label text-muted-foreground">Assignment</span>
        {assignment !== "unmapped" && (
          <AssignmentBadge assignment={assignment} />
        )}
      </div>
    </>
  );
}

function RememberCategoryRuleField({
  id,
  checked,
  disabled,
  className = "",
  onCheckedChange,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly className?: string;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="normal-case">
        Remember this category
      </Label>
    </div>
  );
}

function RememberedRuleFields({
  layout,
  transaction,
  matchType,
  pattern,
  isSaving,
  errorId,
  onMatchTypeChange,
  onPatternChange,
}: {
  readonly layout: "mobile" | "table";
  readonly transaction: CategorizedTransaction;
  readonly matchType: CategoryRule["matchType"];
  readonly pattern: string;
  readonly isSaving: boolean;
  readonly errorId?: string;
  readonly onMatchTypeChange: (matchType: CategoryRule["matchType"]) => void;
  readonly onPatternChange: (pattern: string) => void;
}) {
  const idPrefix =
    layout === "mobile"
      ? `mobile-transaction-${transaction.id}`
      : `transaction-${transaction.id}`;
  const matchTypeId = `${idPrefix}-match-type`;
  const patternId = `${idPrefix}-pattern`;

  return (
    <div
      className={
        layout === "mobile"
          ? "grid gap-3"
          : "flex min-w-0 flex-1 flex-wrap items-end gap-2"
      }
    >
      <div className={layout === "mobile" ? "min-w-0" : "w-32 shrink-0"}>
        <Label htmlFor={matchTypeId} className="text-label">
          Match type
        </Label>
        <Select
          value={matchType}
          onValueChange={onMatchTypeChange}
          disabled={isSaving}
        >
          <SelectTrigger
            id={matchTypeId}
            className={layout === "mobile" ? "mt-1.5" : "mt-1 h-8"}
            aria-label={`Match type for ${transaction.description}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exact">Exact</SelectItem>
            <SelectItem value="contains">Contains</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 flex-1">
        <Label htmlFor={patternId} className="text-label">
          Pattern
        </Label>
        <Input
          id={patternId}
          value={pattern}
          disabled={isSaving || matchType === "exact"}
          maxLength={500}
          onChange={(event) => onPatternChange(event.target.value)}
          className={layout === "mobile" ? "mt-1.5" : "mt-1 h-8 min-w-56"}
          aria-label={`Pattern for ${transaction.description}`}
          aria-describedby={errorId}
        />
      </div>
    </div>
  );
}

function TransactionDraftError({
  id,
  error,
  className,
}: {
  readonly id: string;
  readonly error: string;
  readonly className?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={`font-medium text-destructive ${className ?? ""}`}
    >
      {error}
    </p>
  );
}

function MobileTransactionEditor({
  categoryOptions,
  suggestedCategories,
  categorySuggestionFeedback,
  focusCategoryInitially,
  transaction,
  draft,
  error,
  ruleHelp,
  rememberRule,
  rememberedMatchType,
  rememberedPattern,
  isSaving,
  onDraftChange,
  onUseSuggestedCategory,
  onDescriptionChange,
  onRememberRuleChange,
  onRememberedMatchTypeChange,
  onRememberedPatternChange,
  onApplyAndNext,
  onSave,
  onCancel,
  onToggleCorrections,
}: TransactionEditRowsProps & {
  readonly focusCategoryInitially: boolean;
  readonly onToggleCorrections: () => void;
}) {
  const showCorrections = !focusCategoryInitially;
  const categoryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusCategoryInitially) {
      categoryRef.current?.querySelector<HTMLElement>("[role=combobox]")?.focus();
    }
  }, [focusCategoryInitially, transaction.id]);
  const errorId = `mobile-transaction-${transaction.id}-error`;
  const rememberId = `mobile-transaction-${transaction.id}-remember`;

  return (
    <>
      <div ref={categoryRef} className="grid min-w-0 gap-4 p-5">
        {!showCorrections && (
          <p className="wrap-anywhere">
            {draft.description}<br />
            <span className="font-mono tabular-nums">
              {draft.date} · {formatMoney(Math.abs(Number(draft.amount)))}
            </span>
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isSaving}
          aria-expanded={showCorrections}
          onClick={onToggleCorrections}
        >
          {showCorrections ? "Compact Category assignment" : "Full corrections"}
        </Button>
        <TransactionDraftFields
          layout="mobile"
          compact={!showCorrections}
          focusCategoryInitially={focusCategoryInitially}
          categoryOptions={categoryOptions}
          suggestedCategories={suggestedCategories}
          categorySuggestionFeedback={categorySuggestionFeedback}
          transaction={transaction}
          draft={draft}
          isSaving={isSaving}
          errorId={error ? errorId : undefined}
          onDraftChange={onDraftChange}
          onUseSuggestedCategory={onUseSuggestedCategory}
          onDescriptionChange={onDescriptionChange}
        />
        <RememberCategoryRuleField
          id={rememberId}
          checked={rememberRule}
          disabled={isSaving}
          onCheckedChange={onRememberRuleChange}
        />
        {ruleHelp}
        {rememberRule && (
          <RememberedRuleFields
            layout="mobile"
            transaction={transaction}
            matchType={rememberedMatchType}
            pattern={rememberedPattern}
            isSaving={isSaving}
            errorId={error ? errorId : undefined}
            onMatchTypeChange={onRememberedMatchTypeChange}
            onPatternChange={onRememberedPatternChange}
          />
        )}
        {error && <TransactionDraftError id={errorId} error={error} />}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        {(showCorrections || rememberRule) && (
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {rememberRule ? "Apply & remember" : "Save changes"}
          </Button>
        )}
        <Button type="button" onClick={onApplyAndNext} disabled={isSaving}>
          Apply &amp; next
        </Button>
      </DialogFooter>
    </>
  );
}

function TransactionEditRows({
  focusCategoryInitially = false,
  categoryOptions,
  suggestedCategories,
  categorySuggestionFeedback,
  transaction,
  draft,
  error,
  ruleHelp,
  rememberRule,
  rememberedMatchType,
  rememberedPattern,
  isSaving,
  onDraftChange,
  onUseSuggestedCategory,
  onDescriptionChange,
  onRememberRuleChange,
  onRememberedMatchTypeChange,
  onRememberedPatternChange,
  onApplyAndNext,
  onSave,
  onCancel,
}: TransactionEditRowsProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (focusCategoryInitially) {
      rowRef.current?.querySelector<HTMLElement>("[role=combobox]")?.focus();
    }
  }, [focusCategoryInitially, transaction.id]);
  const errorId = `transaction-${transaction.id}-error`;
  const rememberId = `transaction-${transaction.id}-remember`;

  return (
    <>
      <TableRow ref={rowRef} className="bg-primary/10 hover:bg-primary/10">
        <TransactionDraftFields
          layout="table"
          categoryOptions={categoryOptions}
          suggestedCategories={suggestedCategories}
          categorySuggestionFeedback={categorySuggestionFeedback}
          transaction={transaction}
          draft={draft}
          isSaving={isSaving}
          errorId={error ? errorId : undefined}
          onDraftChange={onDraftChange}
          onUseSuggestedCategory={onUseSuggestedCategory}
          onDescriptionChange={onDescriptionChange}
        />
        <TableCell>
          <div className="flex flex-wrap justify-end gap-1">
            <Button type="button" size="sm" onClick={onApplyAndNext} disabled={isSaving}>Apply &amp; next</Button>
            <Button
              type="button"
              size="icon-sm"
              onClick={onSave}
              disabled={isSaving}
              aria-label={`Save changes to ${transaction.description}`}
            >
              <CheckIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onCancel}
              disabled={isSaving}
              aria-label={`Cancel changes to ${transaction.description}`}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      <TableRow
        className={`bg-primary/10 hover:bg-primary/10 ${
          rememberRule ? "border-b-0" : "!border-b"
        }`}
      >
        <TableCell colSpan={6} className="py-2 whitespace-normal">
          <RememberCategoryRuleField
            id={rememberId}
            checked={rememberRule}
            disabled={isSaving}
            className="justify-end"
            onCheckedChange={onRememberRuleChange}
          />
          {ruleHelp}
        </TableCell>
      </TableRow>
      {rememberRule && (
        <TableRow className="bg-primary/10 hover:bg-primary/10">
          <TableCell colSpan={6} className="py-2 whitespace-normal">
            <div className="flex flex-col gap-2 sm:items-end">
              <RememberedRuleFields
                layout="table"
                transaction={transaction}
                matchType={rememberedMatchType}
                pattern={rememberedPattern}
                isSaving={isSaving}
                errorId={error ? errorId : undefined}
                onMatchTypeChange={onRememberedMatchTypeChange}
                onPatternChange={onRememberedPatternChange}
              />
              {error && <TransactionDraftError id={errorId} error={error} />}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export { CategorizeStatement };
