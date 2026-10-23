import { useEffect, useRef } from "react";
import type { StatementSort } from "./statement-review-order";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  CategoryBadge,
  getCategoryColorClass,
  getDefaultCategoryColor,
  type CategoryColor,
} from "@/shared/category";
import { formatMoney } from "@/shared/money";
import { ActiveSpaceLabel, scrollPageToTop } from "@/shared/ui";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  LandmarkIcon,
  LoaderCircleIcon,
} from "lucide-react";

import { createStatementReviewData, type CategoryBreakdownItem } from "./statement-review-data";
import { ImportProgress } from "./import-progress";
import {
  formatImportDate,
  formatExpenseHistoryPeriod,
} from "./statement-import-date-formatting";
import { formatStatementType } from "./statement-type";
import type { CategoryColorOption } from "./statement-import-service";
import type {
  CategoryEligibilityConflict,
  ProbableDuplicateConflict,
  ProbableDuplicateDetail,
} from "./statement-import-errors";
import { getStatementActivityLabel, isIncludedStatementEntry } from "./statement-import-utils";
import type {
  CategorizedStatement,
  CategorizedStatementEntry,
} from "./statement-categorizer";
import { AssignmentBadge, CategoryMatchCell } from "./statement-category-match";

interface ReviewStatementProps {
  sort?: StatementSort;
  categoryOptions: readonly CategoryColorOption[];
  destinationLabel?: string;
  spaceId?: string;
  fileName: string;
  statementSummary: CategorizedStatement["summary"];
  entries: readonly CategorizedStatementEntry[];
  commitError: Error | null;
  categoryEligibilityConflict: CategoryEligibilityConflict | null;
  probableDuplicateConflict: ProbableDuplicateConflict | null;
  canImportAnyway: boolean;
  canConfirm: boolean;
  isCommitting: boolean;
  hasFileDuplicate: boolean;
  onBack: () => void;
  onCommit: (acknowledgeProbableDuplicates: boolean) => void;
}

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function formatShortDate(value: Date) {
  return shortDateFormatter.format(value).toLocaleUpperCase();
}

function formatPeriod(
  entries: readonly CategorizedStatementEntry[],
) {
  if (entries.length === 0) return "No included Expenses";

  const dates = entries
    .map((expense) => expense.entryDate)
    .sort((left, right) => left.getTime() - right.getTime());
  return `${formatShortDate(dates[0])} – ${formatShortDate(dates.at(-1) ?? dates[0])}`;
}

function formatDuplicateDetail(
  detail: ProbableDuplicateDetail,
  submittedRows: readonly CategorizedStatementEntry[],
) {
  const submittedExpenses = detail.expenseIndexes
    .map((index) => {
      const row = submittedRows[index];
      return row
        ? `Expense ${index + 1} (“${row.description}”)`
        : `Expense ${index + 1}`;
    })
    .join(", ");
  const committedExpenses = detail.committedExpenseIds.length
    ? ` Existing Expense IDs: ${detail.committedExpenseIds.join(", ")}.`
    : " These rows duplicate one another within this submission.";

  return `${submittedExpenses} may already exist.${committedExpenses}`;
}

function formatCategoryEligibilityDetail(
  detail: CategoryEligibilityConflict["details"][number],
  submittedRows: readonly CategorizedStatementEntry[],
) {
  const submittedExpenses = detail.expenseIndexes
    .map((index) => {
      const row = submittedRows[index];
      return row
        ? `Expense ${index + 1} (“${row.description}”)`
        : `Expense ${index + 1}`;
    })
    .join(", ");

  return `${submittedExpenses} uses Category ${detail.categoryId}, which is no longer active.`;
}

interface ReviewExpenseTableProps {
  readonly rows: readonly CategorizedStatementEntry[];
  readonly caption: string;
  readonly getCategoryColor: (categoryId: string) => CategoryColor;
  readonly getCategoryLabel: (categoryId: string) => string;
}

function ReviewExpenseTable({
  rows,
  caption,
  getCategoryColor,
  getCategoryLabel,
}: ReviewExpenseTableProps) {
  return (
    <Table className="min-w-[56rem]">
      <TableCaption className="sr-only">
        {caption}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="w-36 text-right">Amount</TableHead>
          <TableHead className="w-44">Category</TableHead>
          <TableHead className="w-28 text-center">Assignment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((expense) => {
          const activityDescriptionId = `review-${expense.id}-activity-description`;
          return (
            <TableRow
              key={expense.id}
              className={
                expense.isExcluded
                  ? "bg-muted/70 text-muted-foreground hover:bg-muted"
                  : undefined
              }
            >
              <TableCell className="font-mono text-xs font-semibold tabular-nums uppercase">
                {formatShortDate(expense.entryDate)}
              </TableCell>
              <TableCell className="font-medium whitespace-normal">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{expense.description}</span>
                  <ExpenseIndicators
                    expense={expense}
                    activityDescriptionId={activityDescriptionId}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right font-mono font-bold tabular-nums">
                {formatMoney(Math.abs(expense.amount))}
              </TableCell>
              <TableCell>
                <ExpenseCategoryMatch
                  expense={expense}
                  getCategoryColor={getCategoryColor}
                  getCategoryLabel={getCategoryLabel}
                />
              </TableCell>
              <TableCell className="text-center">
                <AssignmentBadge assignment={expense.assignment} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ReviewStatement({
  sort = "date-desc",
  categoryOptions,
  destinationLabel,
  spaceId,
  fileName,
  statementSummary,
  entries: expenses,
  commitError,
  categoryEligibilityConflict,
  probableDuplicateConflict,
  canImportAnyway,
  canConfirm,
  isCommitting,
  hasFileDuplicate,
  onBack,
  onCommit,
}: ReviewStatementProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    scrollPageToTop();
  }, []);

  function getCategoryLabel(categoryId: string) {
    return (
      categoryOptions.find((option) => option.value === categoryId)?.label ??
      "Unknown Category"
    );
  }

  function getCategoryColor(categoryId: string): CategoryColor {
    return (
      categoryOptions.find((option) => option.value === categoryId)?.color ??
      getDefaultCategoryColor(categoryId)
    );
  }

  const {
    includedExpenses,
    excludedExpenses,
    unmappedExpenses,
    ambiguousExpenses,
    categorizedExpenses,
    ruleCount,
    manualCount,
    excludedCount,
    debitTotal,
    averageDebit,
    categoryBreakdown,
    categorizedDebitTotal,
    largestCategoryAmount,
    hasUnmappedExpenses,
  } = createStatementReviewData(
    expenses,
    sort,
    getCategoryLabel,
    getCategoryColor,
  );
  const isEWallet = statementSummary.statementType === "e_wallet";
  const statementHistoryPeriod = formatExpenseHistoryPeriod(
    statementSummary.transactionHistoryStartDate,
    statementSummary.statementDate,
  );

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:min-h-screen lg:px-9 lg:py-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <ActiveSpaceLabel spaceId={spaceId} />
          <p className="text-label text-muted-foreground">Imports / Review</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Review your imported statement
          </h1>
          {destinationLabel && (
            <p className="mt-2 font-mono text-xs font-semibold uppercase text-muted-foreground">
              Destination: {destinationLabel}
            </p>
          )}
        </div>
        <ImportProgress
          currentStep="Review"
          className="max-md:!w-full max-md:[&>li]:min-h-13 max-md:[&>li]:!flex-1 max-md:[&>li]:flex-col max-md:[&>li]:gap-0.5 max-md:[&>li]:px-2"
        />
      </header>

      <main className="flex flex-1 flex-col gap-4">
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-10 lg:top-0 flex flex-wrap justify-between gap-2 border border-structure bg-background p-3 font-mono text-sm font-bold" aria-label="Included expense total">
          <span>{includedExpenses.length} included expenses</span>
          <span>{formatMoney(debitTotal)}</span>
        </div>
        <section
          className="border border-structure md:hidden"
          aria-label="Statement review summary"
        >
          <div className="bg-primary p-4 text-primary-foreground">
            <p className="text-label">
              Statement /{" "}
              {hasUnmappedExpenses ? "Needs Categories" : "Ready to import"}
            </p>
            <p className="mt-1 text-base font-bold wrap-anywhere">
              {statementSummary.provider}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold uppercase wrap-anywhere">
              {isEWallet && `${formatStatementType(statementSummary.statementType)} · `}
              {statementSummary.accountType}
              {!isEWallet && " / ****"}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold uppercase wrap-anywhere">
              File: {fileName}
            </p>
          </div>
          <div className="grid grid-cols-2 border-t border-structure">
            <MobileSummaryMetric
              label={isEWallet ? "Transaction History Period" : "Date"}
              className="border-r border-b"
            >
              {isEWallet
                ? statementHistoryPeriod
                : formatImportDate(statementSummary.statementDate)}
            </MobileSummaryMetric>
            <MobileSummaryMetric
              label={isEWallet ? "Total Debit" : "Amount"}
              className="border-b"
            >
              {formatMoney(
                isEWallet
                  ? (statementSummary.totalDebit ?? 0)
                  : statementSummary.totalAmountDue,
              )}
            </MobileSummaryMetric>
            <MobileSummaryMetric
              label="Expenses included"
              className="border-r"
            >
              {includedExpenses.length}
            </MobileSummaryMetric>
            <MobileSummaryMetric label="Categorization status">
              {categorizedExpenses.length} / {includedExpenses.length}
            </MobileSummaryMetric>
          </div>
        </section>

        <section
          className="hidden border border-structure md:grid md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_repeat(4,minmax(9rem,0.42fr))]"
          aria-label="Statement review summary"
        >
          <div className="flex min-h-28 min-w-0 items-center gap-3 border-b border-structure bg-primary p-4 text-primary-foreground sm:col-span-2 xl:col-span-1 xl:border-r xl:border-b-0">
            <span className="grid size-10 shrink-0 place-content-center bg-secondary text-inverse-accent">
              <LandmarkIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-label">
                Statement /{" "}
                {hasUnmappedExpenses
                  ? "Needs Categories"
                  : "Ready to import"}
              </p>
              <p className="mt-1 truncate text-base font-bold">
                {statementSummary.provider}
              </p>
              <p className="truncate font-mono text-xs font-semibold uppercase">
                {isEWallet && `${formatStatementType(statementSummary.statementType)} · `}
                {statementSummary.accountType} · {fileName}
              </p>
            </div>
          </div>

          <ReviewMetric
            label={isEWallet ? "Transaction History Period" : "Statement date"}
          >
            {isEWallet
              ? statementHistoryPeriod
              : formatImportDate(statementSummary.statementDate)}
          </ReviewMetric>
          <ReviewMetric label={isEWallet ? "Total Debit" : "Statement Amount"} emphasized>
            {formatMoney(
              isEWallet
                ? (statementSummary.totalDebit ?? 0)
                : statementSummary.totalAmountDue,
            )}
          </ReviewMetric>
          <ReviewMetric label="Expenses included">
            {includedExpenses.length}
          </ReviewMetric>
          <ReviewMetric label="Categorization status">
            {categorizedExpenses.length} / {includedExpenses.length}
          </ReviewMetric>
        </section>

        <div className="flex flex-col gap-4 md:hidden">
          <ReviewStatus
            commitError={commitError}
            categoryEligibilityConflict={categoryEligibilityConflict}
            probableDuplicateConflict={probableDuplicateConflict}
            canImportAnyway={canImportAnyway}
            isCommitting={isCommitting}
            hasFileDuplicate={hasFileDuplicate}
            hasUnmappedExpenses={hasUnmappedExpenses}
            unmappedExpenses={unmappedExpenses}
            ambiguousExpenses={ambiguousExpenses}
            includedExpenses={expenses.filter(isIncludedStatementEntry)}
            onCommit={onCommit}
          />
          <MobileCategoryBreakdown
            categoryBreakdown={categoryBreakdown}
            categorizedDebitTotal={categorizedDebitTotal}
          />
          <MobileExpenseList
            entries={includedExpenses}
            getCategoryColor={getCategoryColor}
            getCategoryLabel={getCategoryLabel}
          />

          {excludedExpenses.length > 0 && (
            <details className="border border-structure p-3">
              <summary className="cursor-pointer font-mono text-sm font-bold">Excluded rows ({excludedExpenses.length})</summary>
              <MobileExpenseList entries={excludedExpenses} getCategoryColor={getCategoryColor} getCategoryLabel={getCategoryLabel} excluded />
            </details>
          )}
        </div>

        <div className="hidden gap-4 md:grid xl:grid-cols-[minmax(0,1fr)_22.5rem]">
          <Card variant="strong" className="min-w-0 overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-structure bg-secondary text-secondary-foreground">
              <div>
                <CardTitle className="uppercase">Expense summary</CardTitle>
                <CardDescription className="mt-1 text-inverse-muted">
                  Review every parsed Statement Entry before import.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{ruleCount} Rule</Badge>
                {manualCount > 0 && (
                  <Badge variant="muted">{manualCount} Manual</Badge>
                )}
                {hasUnmappedExpenses && (
                  <Badge
                    variant="outline"
                    className="border-warning bg-warning-surface text-warning"
                  >
                    {unmappedExpenses.length} Unmapped
                  </Badge>
                )}
                {ambiguousExpenses.length > 0 && (
                  <Badge
                    variant="outline"
                    className="border-warning bg-warning-surface text-warning"
                  >
                    {ambiguousExpenses.length} Ambiguous
                  </Badge>
                )}
                {excludedCount > 0 && (
                  <Badge variant="muted">{excludedCount} Excluded</Badge>
                )}
              </div>
            </CardHeader>

            <div className="grid border-b sm:grid-cols-2 lg:grid-cols-4">
              <CompactMetric
                label={isEWallet ? "Included debits" : "Total debits"}
                value={formatMoney(debitTotal)}
              />
              <CompactMetric
                label="Average debit"
                value={formatMoney(averageDebit)}
              />
              <CompactMetric
                label="Top Category"
                value={
                  categoryBreakdown[0]
                    ? `${categoryBreakdown[0].label} · ${categoryBreakdown[0].share.toFixed(1)}%`
                    : "None"
                }
              />
              <CompactMetric
                label={isEWallet ? "Transaction History Period" : "Period"}
                value={
                  isEWallet
                    ? statementHistoryPeriod
                    : formatPeriod(includedExpenses)
                }
              />
            </div>

            <ReviewExpenseTable
              rows={includedExpenses}
              caption={`Included expenses from ${fileName}`}
              getCategoryColor={getCategoryColor}
              getCategoryLabel={getCategoryLabel}
            />
            {excludedExpenses.length > 0 && (
              <details className="border-t p-4">
                <summary className="cursor-pointer font-mono text-sm font-bold">Excluded rows ({excludedExpenses.length})</summary>
                <ReviewExpenseTable
                  rows={excludedExpenses}
                  caption={`Excluded rows from ${fileName}`}
                  getCategoryColor={getCategoryColor}
                  getCategoryLabel={getCategoryLabel}
                />
              </details>
            )}
          </Card>

          <aside className="flex flex-col gap-4" aria-label="Review insights">
            <Card variant="strong">
              <CardHeader className="border-structure bg-secondary text-secondary-foreground">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="uppercase">
                      Expense breakdown
                    </CardTitle>
                    <CardDescription className="mt-1 text-inverse-muted">
                      Included, categorized debits
                    </CardDescription>
                  </div>
                  <p className="font-mono text-sm font-bold text-inverse-accent tabular-nums">
                    {formatMoney(categorizedDebitTotal)}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {categoryBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Categorize an included debit to see the breakdown.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {categoryBreakdown.map((category) => (
                      <li key={category.categoryId}>
                        <div className="flex items-center justify-between gap-3 font-mono text-xs font-semibold uppercase">
                          <span>{category.label}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatMoney(category.amount)} ·{" "}
                            {category.share.toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 bg-muted">
                          <div
                            className={cn(
                              "h-full",
                              getCategoryColorClass(category.color),
                            )}
                            style={{
                              width: `${largestCategoryAmount > 0 ? (category.amount / largestCategoryAmount) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <ReviewStatus
              className="mb-auto"
              commitError={commitError}
              categoryEligibilityConflict={categoryEligibilityConflict}
              probableDuplicateConflict={probableDuplicateConflict}
              canImportAnyway={canImportAnyway}
              isCommitting={isCommitting}
              hasFileDuplicate={hasFileDuplicate}
              hasUnmappedExpenses={hasUnmappedExpenses}
              unmappedExpenses={unmappedExpenses}
              ambiguousExpenses={ambiguousExpenses}
              includedExpenses={expenses.filter(isIncludedStatementEntry)}
                  onCommit={onCommit}
            />
          </aside>
        </div>

        <div className="mt-auto flex flex-row gap-3 border-t border-structure pt-4 sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12 px-0 md:h-10 md:w-auto md:px-4"
            aria-label="Back to Categorize"
            title="Back to Categorize"
            onClick={onBack}
            disabled={isCommitting}
          >
            <ArrowLeftIcon aria-hidden="true" />
            <span className="hidden md:inline">Back to Categorize</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-12 min-w-0 flex-1 md:min-h-10 md:flex-none"
            aria-busy={isCommitting}
            onClick={() => onCommit(false)}
            disabled={
              !canConfirm ||
              hasUnmappedExpenses ||
              isCommitting ||
              Boolean(probableDuplicateConflict) ||
              hasFileDuplicate
            }
          >
            {isCommitting && (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            )}
            {probableDuplicateConflict && canImportAnyway
              ? "Resolve duplicate warning above"
              : `Import ${includedExpenses.length} Expenses`}
            {!isCommitting && !probableDuplicateConflict && (
              <ArrowRightIcon className="text-inverse-accent" aria-hidden="true" />
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}

interface ReviewStatusProps {
  className?: string;
  commitError: Error | null;
  categoryEligibilityConflict: CategoryEligibilityConflict | null;
  probableDuplicateConflict: ProbableDuplicateConflict | null;
  canImportAnyway: boolean;
  isCommitting: boolean;
  hasFileDuplicate: boolean;
  hasUnmappedExpenses: boolean;
  unmappedExpenses: readonly CategorizedStatementEntry[];
  ambiguousExpenses: readonly CategorizedStatementEntry[];
  includedExpenses: readonly CategorizedStatementEntry[];
  onCommit: (acknowledgeProbableDuplicates: boolean) => void;
}

function ReviewStatus({
  className,
  commitError,
  categoryEligibilityConflict,
  probableDuplicateConflict,
  canImportAnyway,
  isCommitting,
  hasFileDuplicate,
  hasUnmappedExpenses,
  unmappedExpenses,
  ambiguousExpenses,
  includedExpenses,
  onCommit,
}: ReviewStatusProps) {
  if (hasUnmappedExpenses) {
    return (
      <Alert variant="warning" className={className}>
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle className="uppercase">Unmapped Expenses</AlertTitle>
        <AlertDescription>
          {unmappedExpenses.length} included{" "}
          {unmappedExpenses.length === 1
            ? "Statement Entry needs"
            : "Statement Entries need"}{" "}
          a Category before import.
          {ambiguousExpenses.length > 0 && (
            <p className="mt-2">
              {ambiguousExpenses.length}{" "}
              {ambiguousExpenses.length === 1
                ? "Statement Entry has"
                : "Statement Entries have"}{" "}
              multiple categories matched. Choose a Category to resolve the
              ambiguity.
            </p>
          )}
          <p className="mt-3">Use Back to Categorize to correct these rows.</p>
        </AlertDescription>
      </Alert>
    );
  }

  if (probableDuplicateConflict) {
    return (
      <Alert variant="warning" className={className}>
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle className="uppercase">
          Probable duplicate Expenses
        </AlertTitle>
        <AlertDescription>
          <p>{probableDuplicateConflict.message}</p>
          <ul className="mt-3 space-y-2 border-t border-warning pt-3">
            {probableDuplicateConflict.details.map((detail) => (
              <li key={detail.field}>
                {formatDuplicateDetail(detail, includedExpenses)}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-warning pt-3 font-semibold">
            Import anyway will commit this Statement Import permanently. A
            committed Statement Import cannot be undone.
          </p>
          {canImportAnyway && (
            <div className="mt-3 flex flex-col gap-2 border-t border-warning pt-3 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onCommit(true)}
                disabled={isCommitting}
              >
                Import anyway
              </Button>
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (categoryEligibilityConflict) {
    return (
      <Alert variant="warning" className={className}>
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle className="uppercase">
          Category assignments need correction
        </AlertTitle>
        <AlertDescription>
          <p>{categoryEligibilityConflict.message}</p>
          <ul className="mt-3 space-y-2 border-t border-warning pt-3">
            {categoryEligibilityConflict.details.map((detail) => (
              <li key={`${detail.categoryId}-${detail.expenseIndexes.join("-")}`}>
                {formatCategoryEligibilityDetail(detail, includedExpenses)}
              </li>
            ))}
          </ul>
          <p className="mt-3">Use Back to Categorize to correct these rows.</p>
        </AlertDescription>
      </Alert>
    );
  }

  if (commitError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle className="uppercase">
          {hasFileDuplicate
            ? "Statement already imported"
            : "Import could not be saved"}
        </AlertTitle>
        <AlertDescription>
          <p>{commitError.message}</p>
          {hasFileDuplicate && (
            <p className="mt-2">This exact file cannot be imported again.</p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card
      variant="accent"
      className={cn("p-4", className)}
      role="status"
      aria-label="Import readiness"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2Icon
          className="mt-0.5 size-5 shrink-0"
          aria-hidden="true"
        />
        <div>
          <p className="font-mono text-sm font-bold uppercase">
            Ready to import
          </p>
          <p className="mt-1 text-sm">
            Every included Statement Entry has a Category.
          </p>
          <p className="mt-2 text-sm">
            Importing saves these details and cannot be undone.
          </p>
        </div>
      </div>
    </Card>
  );
}

interface MobileCategoryBreakdownProps {
  categoryBreakdown: readonly CategoryBreakdownItem[];
  categorizedDebitTotal: number;
}

function MobileCategoryBreakdown({
  categoryBreakdown,
  categorizedDebitTotal,
}: MobileCategoryBreakdownProps) {
  return (
    <Card
      variant="strong"
      role="region"
      aria-labelledby="mobile-category-breakdown-heading"
    >
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle id="mobile-category-breakdown-heading">
            Category breakdown
          </CardTitle>
          <CardDescription className="mt-1">
            Included, categorized debits
          </CardDescription>
        </div>
        <p className="shrink-0 font-mono text-sm font-bold tabular-nums">
          {formatMoney(categorizedDebitTotal)}
        </p>
      </CardHeader>
      <CardContent>
        {categoryBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Categorize an included debit to see the breakdown.
          </p>
        ) : (
          <ul className="space-y-3">
            {categoryBreakdown.map((category) => (
              <li
                key={category.categoryId}
                className="flex items-center justify-between gap-3"
              >
                <CategoryBadge
                  categoryId={category.categoryId}
                  color={category.color}
                  className="min-w-0 max-w-[58%] whitespace-normal wrap-anywhere"
                >
                  {category.label}
                </CategoryBadge>
                <div className="flex shrink-0 items-baseline gap-2 text-right font-mono text-xs font-semibold tabular-nums">
                  <span>{formatMoney(category.amount)}</span>
                  <span className="text-muted-foreground">
                    {category.share.toFixed(1)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface MobileExpenseListProps {
  excluded?: boolean;
  entries: readonly CategorizedStatementEntry[];
  getCategoryColor: (categoryId: string) => CategoryColor;
  getCategoryLabel: (categoryId: string) => string;
}

interface ExpenseIndicatorsProps {
  expense: CategorizedStatementEntry;
  activityDescriptionId: string;
}

function ExpenseIndicators({
  expense,
  activityDescriptionId,
}: ExpenseIndicatorsProps) {
  return (
    <>
      <Badge variant="muted" aria-describedby={expense.isExcluded ? activityDescriptionId : undefined}>
        {getStatementActivityLabel(expense)}
      </Badge>
      {expense.isExcluded && (
        <span id={activityDescriptionId} className="text-xs text-muted-foreground">
          {expense.amount <= 0 ? "Excluded by you" : `${getStatementActivityLabel(expense)} — not an expense`}
        </span>
      )}
    </>
  );
}

interface ExpenseCategoryMatchProps {
  expense: CategorizedStatementEntry;
  className?: string;
  getCategoryColor: (categoryId: string) => CategoryColor;
  getCategoryLabel: (categoryId: string) => string;
}

function ExpenseCategoryMatch({
  expense,
  className,
  getCategoryColor,
  getCategoryLabel,
}: ExpenseCategoryMatchProps) {
  return (
    <CategoryMatchCell
      assignment={expense.assignment}
      categoryId={expense.categoryId}
      className={className}
      getCategoryColor={getCategoryColor}
      getCategoryLabel={getCategoryLabel}
      matchedCategoryIds={expense.matchedCategoryIds}
    />
  );
}

function MobileExpenseList({
  excluded = false,
  entries: expenses,
  getCategoryColor,
  getCategoryLabel,
}: MobileExpenseListProps) {
  return (
    <section
      className="border border-structure"
      aria-label={excluded ? "Excluded row details" : "Included expense details"}
    >
      <div className="flex items-center justify-between gap-3 border-b p-3.5">
        <h2
          className="font-mono text-sm font-bold tracking-tight uppercase"
        >
          {excluded ? "Excluded row details" : "Included expenses"}
        </h2>
        <p className="shrink-0 font-mono text-xs font-semibold text-muted-foreground uppercase">
          {expenses.length} Expenses
        </p>
      </div>
      <ul className="divide-y" aria-label={excluded ? "Excluded rows to review" : "Expenses to review"}>
        {expenses.map((expense) => {
          const activityDescriptionId = `mobile-review-${expense.id}-activity-description`;
          const markerClass = expense.categoryId
            ? getCategoryColorClass(getCategoryColor(expense.categoryId))
            : "bg-warning";

          return (
            <li
              key={expense.id}
              className={cn(
                "flex items-start gap-3 p-4",
                expense.isExcluded && "bg-muted/70 text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("mt-1.5 size-2 shrink-0", markerClass)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 font-semibold wrap-anywhere">
                        {expense.description}
                      </p>
                      <ExpenseIndicators
                        expense={expense}
                        activityDescriptionId={activityDescriptionId}
                      />
                    </div>
                    <p className="mt-1 font-mono text-xs font-semibold uppercase text-muted-foreground">
                      {formatImportDate(expense.entryDate)}
                    </p>
                  </div>
                  <p className="max-w-[45%] shrink-0 text-right font-mono text-sm font-bold tabular-nums wrap-anywhere">
                    {formatMoney(Math.abs(expense.amount))}
                  </p>
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                  <ExpenseCategoryMatch
                    expense={expense}
                    className="max-w-full whitespace-normal wrap-anywhere"
                    getCategoryColor={getCategoryColor}
                    getCategoryLabel={getCategoryLabel}
                  />
                  <AssignmentBadge assignment={expense.assignment} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface MobileSummaryMetricProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

function MobileSummaryMetric({
  label,
  className,
  children,
}: MobileSummaryMetricProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 p-3", className)}>
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="font-mono text-xs font-bold tabular-nums uppercase wrap-anywhere">
        {children}
      </p>
    </div>
  );
}

interface ReviewMetricProps {
  label: string;
  children: React.ReactNode;
  emphasized?: boolean;
}

function ReviewMetric({ label, children, emphasized }: ReviewMetricProps) {
  return (
    <div className="flex min-h-24 flex-col justify-center border-b p-4 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-l xl:border-b-0">
      <p className="text-label text-muted-foreground">{label}</p>
      <p
        className={`mt-2 font-mono text-lg font-bold tabular-nums ${emphasized ? "tracking-tight" : "uppercase"}`}
      >
        {children}
      </p>
    </div>
  );
}

interface CompactMetricProps {
  label: string;
  value: string;
}

function CompactMetric({ label, value }: CompactMetricProps) {
  return (
    <div className="border-b p-3 sm:odd:border-r lg:border-r lg:border-b-0 lg:last:border-r-0">
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums uppercase">
        {value}
      </p>
    </div>
  );
}

export { ReviewStatement };
