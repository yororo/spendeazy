import { useEffect, useMemo, useState } from "react";
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
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  type CategoryCatalogOption,
  type CategoryColorOption,
  type CategoryRule,
} from "./statement-import-service";
import {
  getCategoryLabel,
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

type CategoryFilter = "all" | "unmapped" | string;
const MOBILE_EDITOR_BREAKPOINT_PX = 768;

interface CategorizeStatementProps {
  categoryOptions: readonly CategoryColorOption[];
  categoryLabels: readonly CategoryCatalogOption[];
  categoryRules: readonly CategoryRule[];
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
  onChangeRememberedMatchType: (matchType: CategoryRule["matchType"]) => boolean;
  onChangeRememberedPattern: (pattern: string) => boolean;
  onSaveEdit: () => void;
  onToggleTransactionExclusion: (transactionId: string) => boolean;
  onBack: () => void;
  onReview: () => void;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: Date) {
  return dateFormatter.format(value);
}

function CategorizeStatement({
  categoryOptions,
  categoryLabels,
  categoryRules,
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
  onBack,
  onReview,
}: CategorizeStatementProps) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
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

  const visibleTransactions = useMemo(() => {
    const normalizedSearch = normalizeDescription(search);

    return transactions.filter((transaction) => {
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
    });
  }, [categoryFilter, dateFrom, dateTo, search, transactions]);
  const editingTransactionIsVisible = visibleTransactions.some(
    (transaction) => transaction.id === editingId,
  );

  function getCategoryColor(categoryId: string): CategoryColor {
    return (
      categoryLabels.find((option) => option.value === categoryId)?.color ??
      getDefaultCategoryColor(categoryId)
    );
  }

  function clearFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setCategoryFilter("all");
  }

  function advanceToReview() {
    onReview();
  }

  function returnToUpload() {
    onBack();
  }

  function beginDesktopEditing(transactionId: string) {
    if (onBeginEdit(transactionId)) setMobileEditorOpen(false);
  }

  function beginMobileEditing(transactionId: string) {
    if (onBeginEdit(transactionId)) setMobileEditorOpen(true);
  }

  function cancelEditing() {
    if (onCancelEdit()) setMobileEditorOpen(false);
  }

  function closeMobileEditor() {
    cancelEditing();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:min-h-screen lg:px-9 lg:py-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-label text-muted-foreground">
            Imports / Categorize
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight md:text-3xl">
            Categorize and update
          </h1>
        </div>
        <ImportProgress
          currentStep="Categorize"
          className="max-md:!w-full max-md:[&>li]:min-h-13 max-md:[&>li]:!flex-1 max-md:[&>li]:flex-col max-md:[&>li]:gap-0.5 max-md:[&>li]:px-2"
        />
      </header>

      {isSaving && (
        <p role="status" aria-live="polite" className="font-mono text-sm font-semibold">
          Saving…
        </p>
      )}
      {draftError && !mobileEditorOpen && !editingTransactionIsVisible && (
        <p role="alert" className="font-medium text-destructive">
          {draftError}
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
              {statementSummary.accountType} · {fileName}
            </p>
          </div>
          <div className="grid grid-cols-3 border-t border-foreground">
            <MobileSummaryMetric label="Date">
              {formatDate(statementSummary.statementDate)}
            </MobileSummaryMetric>
            <MobileSummaryMetric label="Amount">
              {formatMoney(statementSummary.totalAmountDue)}
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
                {statementSummary.accountType} · {fileName}
              </p>
            </div>
          </div>

          <SummaryMetric label="Statement date">
            {formatDate(statementSummary.statementDate)}
          </SummaryMetric>
          <SummaryMetric label="Statement Amount" emphasized>
            {formatMoney(statementSummary.totalAmountDue)}
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
                    <Input
                      id="mobile-transaction-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                      className="mt-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mobile-transaction-date-to">To</Label>
                    <Input
                      id="mobile-transaction-date-to"
                      type="date"
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

          <div className="hidden gap-3 border-b p-3 md:grid lg:grid-cols-[minmax(14rem,1fr)_10.5rem_10.5rem_12rem_auto] lg:items-end">
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
              <Input
                id="transaction-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="transaction-date-to">To</Label>
              <Input
                id="transaction-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="transaction-category-filter">Category</Label>
              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
              >
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
                  return (
                    <li
                      key={transaction.id}
                      className={`space-y-3 p-4 ${
                        transaction.isExcluded
                          ? "bg-muted/70 text-muted-foreground"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 font-semibold wrap-anywhere">
                              {transaction.description}
                            </p>
                            {transaction.amount > 0 && (
                              <Badge variant="muted">Debit</Badge>
                            )}
                            {transaction.isExcluded && (
                              <Badge variant="muted">Excluded</Badge>
                            )}
                          </div>
                          <p className="mt-1 font-mono text-xs font-semibold uppercase text-muted-foreground">
                            {formatDate(transaction.transactionDate)}
                          </p>
                        </div>
                        <p className="max-w-1/2 shrink-0 font-mono text-sm font-bold tabular-nums wrap-anywhere">
                          {formatMoney(transaction.amount)}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="focus-ledger flex min-h-10 w-full items-center justify-between gap-3 border border-input bg-muted px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isEditing || transaction.isExcluded}
                        aria-label={`Edit Category for ${transaction.description}`}
                      >
                        <div className="min-w-0 whitespace-normal wrap-anywhere">
                          <CategoryMatchCell
                            assignment={transaction.assignment}
                            categoryId={transaction.categoryId}
                            getCategoryLabel={getCategoryLabelForTransaction}
                            getCategoryColor={getCategoryColor}
                            matchedCategoryIds={transaction.matchedCategoryIds}
                          />
                        </div>
                      </button>

                      <div className="flex items-center justify-between gap-3">
                        {transaction.assignment !== "unmapped" && (
                          <AssignmentBadge assignment={transaction.assignment} />
                        )}
                        <div className="ml-auto flex gap-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-11"
                            onClick={() => beginMobileEditing(transaction.id)}
                            disabled={isEditing || transaction.isExcluded}
                            aria-label={`Edit ${transaction.description}`}
                          >
                            <PencilIcon aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={`size-11 ${
                              transaction.isExcluded
                                ? "text-success hover:text-success"
                                : "text-destructive hover:text-destructive"
                            }`}
                            onClick={() =>
                              onToggleTransactionExclusion(transaction.id)
                            }
                            disabled={isEditing || transaction.amount > 0}
                            aria-label={
                              transaction.amount > 0
                                ? `Debit ${transaction.description} is permanently excluded`
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
                          transaction={transaction}
                          draft={draft}
                          error={draftError}
                          rememberRule={rememberRule}
                          rememberedMatchType={rememberedMatchType}
                          rememberedPattern={rememberedPattern}
                          isSaving={isSaving}
                          onDraftChange={onChangeDraft}
                          onDescriptionChange={onChangeDescription}
                          onRememberRuleChange={onChangeRememberRule}
                          onRememberedMatchTypeChange={
                            onChangeRememberedMatchType
                          }
                          onRememberedPatternChange={onChangeRememberedPattern}
                          onSave={onSaveEdit}
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
                          {formatDate(transaction.transactionDate)}
                        </TableCell>
                        <TableCell className="font-medium whitespace-normal">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{transaction.description}</span>
                            {transaction.amount > 0 && (
                              <Badge variant="muted">Debit</Badge>
                            )}
                            {transaction.isExcluded && (
                              <Badge variant="muted">Excluded</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold tabular-nums">
                          {formatMoney(transaction.amount)}
                        </TableCell>
                        <TableCell>
                          <CategoryMatchCell
                            assignment={transaction.assignment}
                            categoryId={transaction.categoryId}
                            getCategoryLabel={getCategoryLabelForTransaction}
                            getCategoryColor={getCategoryColor}
                            matchedCategoryIds={transaction.matchedCategoryIds}
                          />
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => beginDesktopEditing(transaction.id)}
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
                                onToggleTransactionExclusion(transaction.id)
                              }
                              disabled={isEditing || transaction.amount > 0}
                              aria-label={
                                transaction.amount > 0
                                  ? `Debit ${transaction.description} is permanently excluded`
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
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  if (event.currentTarget instanceof HTMLElement) {
                    event.currentTarget.focus();
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
                  categoryOptions={categoryOptions}
                  transaction={editingTransaction}
                  draft={draft}
                  error={draftError}
                  rememberRule={rememberRule}
                  rememberedMatchType={rememberedMatchType}
                  rememberedPattern={rememberedPattern}
                  isSaving={isSaving}
                  onDraftChange={onChangeDraft}
                  onDescriptionChange={onChangeDescription}
                  onRememberRuleChange={onChangeRememberRule}
                  onRememberedMatchTypeChange={onChangeRememberedMatchType}
                  onRememberedPatternChange={onChangeRememberedPattern}
                  onSave={onSaveEdit}
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

interface TransactionEditRowsProps {
  categoryOptions: readonly CategoryColorOption[];
  transaction: CategorizedTransaction;
  draft: TransactionDraft;
  error: string | null;
  rememberRule: boolean;
  isSaving: boolean;
  rememberedMatchType: CategoryRule["matchType"];
  rememberedPattern: string;
  onDraftChange: (draft: TransactionDraft) => void;
  onDescriptionChange: (description: string) => void;
  onRememberRuleChange: (checked: boolean) => void;
  onRememberedMatchTypeChange: (matchType: CategoryRule["matchType"]) => void;
  onRememberedPatternChange: (pattern: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

interface TransactionDraftFieldsProps {
  readonly layout: "mobile" | "table";
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly transaction: CategorizedTransaction;
  readonly draft: TransactionDraft;
  readonly isSaving: boolean;
  readonly errorId?: string;
  readonly onDraftChange: (draft: TransactionDraft) => void;
  readonly onDescriptionChange: (description: string) => void;
}

function TransactionDraftFields({
  layout,
  categoryOptions,
  transaction,
  draft,
  isSaving,
  errorId,
  onDraftChange,
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
    <Input
      id={idPrefix ? `${idPrefix}-date` : undefined}
      type="date"
      value={draft.date}
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

  if (layout === "table") {
    return (
      <>
        <TableCell>{dateInput}</TableCell>
        <TableCell>{descriptionInput}</TableCell>
        <TableCell>{amountInput}</TableCell>
        <TableCell>{categoryInput}</TableCell>
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
      <div className="min-w-0">
        <Label htmlFor={`${idPrefix}-category`}>Category</Label>
        {categoryInput}
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
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="exact">Exact</SelectItem>
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
  transaction,
  draft,
  error,
  rememberRule,
  rememberedMatchType,
  rememberedPattern,
  isSaving,
  onDraftChange,
  onDescriptionChange,
  onRememberRuleChange,
  onRememberedMatchTypeChange,
  onRememberedPatternChange,
  onSave,
  onCancel,
}: TransactionEditRowsProps) {
  const errorId = `mobile-transaction-${transaction.id}-error`;
  const rememberId = `mobile-transaction-${transaction.id}-remember`;

  return (
    <>
      <div className="grid min-w-0 gap-4 p-5">
        <TransactionDraftFields
          layout="mobile"
          categoryOptions={categoryOptions}
          transaction={transaction}
          draft={draft}
          isSaving={isSaving}
          errorId={error ? errorId : undefined}
          onDraftChange={onDraftChange}
          onDescriptionChange={onDescriptionChange}
        />
        <RememberCategoryRuleField
          id={rememberId}
          checked={rememberRule}
          disabled={isSaving}
          onCheckedChange={onRememberRuleChange}
        />
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
        <Button type="button" onClick={onSave} disabled={isSaving}>
          Save changes
        </Button>
      </DialogFooter>
    </>
  );
}

function TransactionEditRows({
  categoryOptions,
  transaction,
  draft,
  error,
  rememberRule,
  rememberedMatchType,
  rememberedPattern,
  isSaving,
  onDraftChange,
  onDescriptionChange,
  onRememberRuleChange,
  onRememberedMatchTypeChange,
  onRememberedPatternChange,
  onSave,
  onCancel,
}: TransactionEditRowsProps) {
  const errorId = `transaction-${transaction.id}-error`;
  const rememberId = `transaction-${transaction.id}-remember`;

  return (
    <>
      <TableRow className="bg-primary/10 hover:bg-primary/10">
        <TransactionDraftFields
          layout="table"
          categoryOptions={categoryOptions}
          transaction={transaction}
          draft={draft}
          isSaving={isSaving}
          errorId={error ? errorId : undefined}
          onDraftChange={onDraftChange}
          onDescriptionChange={onDescriptionChange}
        />
        <TableCell>
          <div className="flex justify-end gap-1">
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
