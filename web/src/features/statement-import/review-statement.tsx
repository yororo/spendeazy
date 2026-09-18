import { ApiError } from "@/shared/api";
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
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  LandmarkIcon,
  LoaderCircleIcon,
} from "lucide-react";

import { ImportProgress } from "./import-progress";
import type { CategoryColorOption } from "./statement-import-service";
import type {
  ProbableDuplicateConflict,
  ProbableDuplicateDetail,
} from "./statement-import-errors";
import { isIncludedStatementTransaction } from "./statement-import-utils";
import type {
  CategorizedStatement,
  CategorizedTransaction,
} from "./statement-categorizer";
import { AssignmentBadge, CategoryMatchCell } from "./statement-category-match";

interface ReviewStatementProps {
  categoryOptions: readonly CategoryColorOption[];
  fileName: string;
  statementSummary: CategorizedStatement["summary"];
  transactions: CategorizedTransaction[];
  commitError: Error | null;
  probableDuplicateConflict: ProbableDuplicateConflict | null;
  canImportAnyway: boolean;
  isCommitting: boolean;
  onBack: () => void;
  onResolve: () => void;
  onCommit: (acknowledgeProbableDuplicates: boolean) => void;
}

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function formatDate(value: Date) {
  return fullDateFormatter.format(value);
}

function formatShortDate(value: Date) {
  return shortDateFormatter.format(value).toLocaleUpperCase();
}

function formatPeriod(
  transactions: readonly CategorizedTransaction[],
) {
  if (transactions.length === 0) return "No included Transactions";

  const dates = transactions
    .map((transaction) => transaction.transactionDate)
    .sort((left, right) => left.getTime() - right.getTime());
  return `${formatShortDate(dates[0])} – ${formatShortDate(dates.at(-1) ?? dates[0])}`;
}

function formatDuplicateDetail(
  detail: ProbableDuplicateDetail,
  submittedRows: readonly CategorizedTransaction[],
) {
  const submittedTransactions = detail.transactionIndexes
    .map((index) => {
      const row = submittedRows[index];
      return row
        ? `Transaction ${index + 1} (“${row.description}”)`
        : `Transaction ${index + 1}`;
    })
    .join(", ");
  const committedTransactions = detail.committedTransactionIds.length
    ? ` Existing Transaction IDs: ${detail.committedTransactionIds.join(", ")}.`
    : " These rows duplicate one another within this submission.";

  return `${submittedTransactions} may already exist.${committedTransactions}`;
}

function ReviewStatement({
  categoryOptions,
  fileName,
  statementSummary,
  transactions,
  commitError,
  probableDuplicateConflict,
  canImportAnyway,
  isCommitting,
  onBack,
  onResolve,
  onCommit,
}: ReviewStatementProps) {
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

  const includedTransactions = transactions.filter(
    isIncludedStatementTransaction,
  );
  const unmappedTransactions = includedTransactions.filter(
    (transaction) => transaction.categoryId === null,
  );
  const ambiguousTransactions = includedTransactions.filter(
    (transaction) => transaction.assignment === "ambiguous",
  );
  const categorizedTransactions = includedTransactions.filter(
    (transaction) => transaction.categoryId !== null,
  );
  const ruleCount = categorizedTransactions.filter(
    (transaction) => transaction.assignment === "rule",
  ).length;
  const manualCount = categorizedTransactions.filter(
    (transaction) => transaction.assignment === "manual",
  ).length;
  const excludedCount = transactions.length - includedTransactions.length;
  const debitTotal = includedTransactions.reduce(
    (total, transaction) => total + Math.abs(transaction.amount),
    0,
  );
  const averageDebit =
    includedTransactions.length > 0
      ? debitTotal / includedTransactions.length
      : 0;

  const categoryTotals = new Map<string, number>();
  includedTransactions.forEach((transaction) => {
    if (!transaction.categoryId) return;

    categoryTotals.set(
      transaction.categoryId,
      (categoryTotals.get(transaction.categoryId) ?? 0) +
        Math.abs(transaction.amount),
    );
  });
  const categoryBreakdown = [...categoryTotals.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      amount,
      label: getCategoryLabel(categoryId),
      color: getCategoryColor(categoryId),
      share: debitTotal > 0 ? (amount / debitTotal) * 100 : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
  const categorizedDebitTotal = categoryBreakdown.reduce(
    (total, category) => total + category.amount,
    0,
  );
  const largestCategoryAmount = categoryBreakdown[0]?.amount ?? 0;
  const hasUnmappedTransactions = unmappedTransactions.length > 0;
  const hasFileDuplicate =
    commitError instanceof ApiError &&
    commitError.code === "STATEMENT_IMPORT_FILE_ALREADY_EXISTS";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:min-h-screen lg:px-9 lg:py-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-label text-muted-foreground">Imports / Review</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Review your imported statement
          </h1>
        </div>
        <ImportProgress
          currentStep="Review"
          className="max-md:!w-full max-md:[&>li]:min-h-13 max-md:[&>li]:!flex-1 max-md:[&>li]:flex-col max-md:[&>li]:gap-0.5 max-md:[&>li]:px-2"
        />
      </header>

      <main className="flex flex-1 flex-col gap-4">
        <section
          className="border border-foreground md:hidden"
          aria-label="Statement review summary"
        >
          <div className="bg-primary p-4 text-primary-foreground">
            <p className="text-label">
              Statement /{" "}
              {hasUnmappedTransactions ? "Needs Categories" : "Ready to import"}
            </p>
            <p className="mt-1 text-base font-bold wrap-anywhere">
              {statementSummary.provider}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold uppercase wrap-anywhere">
              {statementSummary.accountType} / ****
            </p>
            <p className="mt-1 font-mono text-xs font-semibold uppercase wrap-anywhere">
              File: {fileName}
            </p>
          </div>
          <div className="grid grid-cols-2 border-t border-foreground">
            <MobileSummaryMetric label="Date" className="border-r border-b">
              {formatDate(statementSummary.statementDate)}
            </MobileSummaryMetric>
            <MobileSummaryMetric label="Amount" className="border-b">
              {formatMoney(statementSummary.totalAmountDue)}
            </MobileSummaryMetric>
            <MobileSummaryMetric
              label="Transactions included"
              className="border-r"
            >
              {includedTransactions.length}
            </MobileSummaryMetric>
            <MobileSummaryMetric label="Categorization status">
              {categorizedTransactions.length} / {includedTransactions.length}
            </MobileSummaryMetric>
          </div>
        </section>

        <section
          className="hidden border border-foreground md:grid md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_repeat(4,minmax(9rem,0.42fr))]"
          aria-label="Statement review summary"
        >
          <div className="flex min-h-28 min-w-0 items-center gap-3 border-b border-foreground bg-primary p-4 text-primary-foreground sm:col-span-2 xl:col-span-1 xl:border-r xl:border-b-0">
            <span className="grid size-10 shrink-0 place-content-center bg-secondary text-primary">
              <LandmarkIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-label">
                Statement /{" "}
                {hasUnmappedTransactions
                  ? "Needs Categories"
                  : "Ready to import"}
              </p>
              <p className="mt-1 truncate text-base font-bold">
                {statementSummary.provider}
              </p>
              <p className="truncate font-mono text-xs font-semibold uppercase">
                {statementSummary.accountType} · {fileName}
              </p>
            </div>
          </div>

          <ReviewMetric label="Statement date">
            {formatDate(statementSummary.statementDate)}
          </ReviewMetric>
          <ReviewMetric label="Statement Amount" emphasized>
            {formatMoney(statementSummary.totalAmountDue)}
          </ReviewMetric>
          <ReviewMetric label="Transactions included">
            {includedTransactions.length}
          </ReviewMetric>
          <ReviewMetric label="Categorization status">
            {categorizedTransactions.length} / {includedTransactions.length}
          </ReviewMetric>
        </section>

        <div className="flex flex-col gap-4 md:hidden">
          <ReviewStatus
            commitError={commitError}
            probableDuplicateConflict={probableDuplicateConflict}
            canImportAnyway={canImportAnyway}
            isCommitting={isCommitting}
            hasFileDuplicate={hasFileDuplicate}
            hasUnmappedTransactions={hasUnmappedTransactions}
            unmappedTransactions={unmappedTransactions}
            ambiguousTransactions={ambiguousTransactions}
            includedTransactions={includedTransactions}
            onBack={onBack}
            onResolve={onResolve}
            onCommit={onCommit}
          />
          <MobileCategoryBreakdown
            categoryBreakdown={categoryBreakdown}
            categorizedDebitTotal={categorizedDebitTotal}
          />
          <MobileTransactionList
            transactions={transactions}
            getCategoryColor={getCategoryColor}
            getCategoryLabel={getCategoryLabel}
          />
        </div>

        <div className="hidden gap-4 md:grid xl:grid-cols-[minmax(0,1fr)_22.5rem]">
          <Card variant="strong" className="min-w-0 overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-foreground bg-secondary text-secondary-foreground">
              <div>
                <CardTitle className="uppercase">Transaction summary</CardTitle>
                <CardDescription className="mt-1 text-border">
                  Review every parsed Transaction before import.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{ruleCount} Rule</Badge>
                {manualCount > 0 && (
                  <Badge variant="muted">{manualCount} Manual</Badge>
                )}
                {hasUnmappedTransactions && (
                  <Badge
                    variant="outline"
                    className="border-warning bg-warning-surface text-warning"
                  >
                    {unmappedTransactions.length} Unmapped
                  </Badge>
                )}
                {ambiguousTransactions.length > 0 && (
                  <Badge
                    variant="outline"
                    className="border-warning bg-warning-surface text-warning"
                  >
                    {ambiguousTransactions.length} Ambiguous
                  </Badge>
                )}
                {excludedCount > 0 && (
                  <Badge variant="muted">{excludedCount} Excluded</Badge>
                )}
              </div>
            </CardHeader>

            <div className="grid border-b sm:grid-cols-2 lg:grid-cols-4">
              <CompactMetric
                label="Total debits"
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
                label="Period"
                value={formatPeriod(includedTransactions)}
              />
            </div>

            <Table className="min-w-[56rem]">
              <TableCaption className="sr-only">
                All Transactions parsed from {fileName}
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
                {transactions.map((transaction) => {
                  const creditDescriptionId = `review-${transaction.id}-credit-description`;
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
                        {formatShortDate(transaction.transactionDate)}
                      </TableCell>
                      <TableCell className="font-medium whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{transaction.description}</span>
                          <TransactionIndicators
                            transaction={transaction}
                            creditDescriptionId={creditDescriptionId}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold tabular-nums">
                        {formatMoney(transaction.amount)}
                      </TableCell>
                      <TableCell>
                        <TransactionCategoryMatch
                          transaction={transaction}
                          getCategoryColor={getCategoryColor}
                          getCategoryLabel={getCategoryLabel}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <AssignmentBadge assignment={transaction.assignment} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <aside className="flex flex-col gap-4" aria-label="Review insights">
            <Card variant="strong">
              <CardHeader className="border-foreground bg-secondary text-secondary-foreground">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="uppercase">
                      Expense breakdown
                    </CardTitle>
                    <CardDescription className="mt-1 text-border">
                      Included, categorized debits
                    </CardDescription>
                  </div>
                  <p className="font-mono text-sm font-bold text-primary tabular-nums">
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
              probableDuplicateConflict={probableDuplicateConflict}
              canImportAnyway={canImportAnyway}
              isCommitting={isCommitting}
              hasFileDuplicate={hasFileDuplicate}
              hasUnmappedTransactions={hasUnmappedTransactions}
              unmappedTransactions={unmappedTransactions}
              ambiguousTransactions={ambiguousTransactions}
              includedTransactions={includedTransactions}
              onBack={onBack}
              onResolve={onResolve}
              onCommit={onCommit}
            />
          </aside>
        </div>

        <div className="mt-auto flex flex-row gap-3 border-t border-foreground pt-4 sm:items-center sm:justify-between">
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
              hasUnmappedTransactions ||
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
              : `Import ${includedTransactions.length} Transactions`}
            {!isCommitting && !probableDuplicateConflict && (
              <ArrowRightIcon className="text-primary" aria-hidden="true" />
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
  probableDuplicateConflict: ProbableDuplicateConflict | null;
  canImportAnyway: boolean;
  isCommitting: boolean;
  hasFileDuplicate: boolean;
  hasUnmappedTransactions: boolean;
  unmappedTransactions: readonly CategorizedTransaction[];
  ambiguousTransactions: readonly CategorizedTransaction[];
  includedTransactions: readonly CategorizedTransaction[];
  onBack: () => void;
  onResolve: () => void;
  onCommit: (acknowledgeProbableDuplicates: boolean) => void;
}

function ReviewStatus({
  className,
  commitError,
  probableDuplicateConflict,
  canImportAnyway,
  isCommitting,
  hasFileDuplicate,
  hasUnmappedTransactions,
  unmappedTransactions,
  ambiguousTransactions,
  includedTransactions,
  onBack,
  onResolve,
  onCommit,
}: ReviewStatusProps) {
  if (hasUnmappedTransactions) {
    return (
      <Alert variant="warning" className={className}>
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle className="uppercase">Unmapped Transactions</AlertTitle>
        <AlertDescription>
          {unmappedTransactions.length} included{" "}
          {unmappedTransactions.length === 1
            ? "Transaction needs"
            : "Transactions need"}{" "}
          a Category before import.
          {ambiguousTransactions.length > 0 && (
            <p className="mt-2">
              {ambiguousTransactions.length}{" "}
              {ambiguousTransactions.length === 1
                ? "Transaction has"
                : "Transactions have"}{" "}
              multiple categories matched. Choose a Category to resolve the
              ambiguity.
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            className="mt-3 w-full"
            onClick={onResolve}
          >
            Resolve before import
            <ArrowRightIcon className="text-primary" aria-hidden="true" />
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (probableDuplicateConflict) {
    return (
      <Alert variant="warning" className={className}>
        <AlertTriangleIcon aria-hidden="true" />
        <AlertTitle className="uppercase">
          Probable duplicate Transactions
        </AlertTitle>
        <AlertDescription>
          <p>{probableDuplicateConflict.message}</p>
          <ul className="mt-3 space-y-2 border-t border-warning pt-3">
            {probableDuplicateConflict.details.map((detail) => (
              <li key={detail.field}>
                {formatDuplicateDetail(detail, includedTransactions)}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-warning pt-3 font-semibold">
            Import anyway will commit this Statement Import permanently. A
            committed Statement Import cannot be undone.
          </p>
          {canImportAnyway && (
            <div className="mt-3 flex flex-col gap-2 border-t border-warning pt-3 sm:flex-row">
              <Button type="button" variant="outline" onClick={onBack}>
                Cancel
              </Button>
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
            Every included Transaction has a Category.
          </p>
          <p className="mt-2 text-sm">
            Importing saves these details and cannot be undone.
          </p>
        </div>
      </div>
    </Card>
  );
}

interface CategoryBreakdownItem {
  readonly categoryId: string;
  readonly amount: number;
  readonly label: string;
  readonly color: CategoryColor;
  readonly share: number;
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

interface MobileTransactionListProps {
  transactions: readonly CategorizedTransaction[];
  getCategoryColor: (categoryId: string) => CategoryColor;
  getCategoryLabel: (categoryId: string) => string;
}

interface TransactionIndicatorsProps {
  transaction: CategorizedTransaction;
  creditDescriptionId: string;
}

function TransactionIndicators({
  transaction,
  creditDescriptionId,
}: TransactionIndicatorsProps) {
  return (
    <>
      {transaction.amount < 0 && (
        <>
          <Badge variant="success" aria-describedby={creditDescriptionId}>
            Credit
          </Badge>
          <span id={creditDescriptionId} className="sr-only">
            Credit. Included in import.
          </span>
        </>
      )}
      {transaction.isExcluded && <Badge variant="muted">Excluded</Badge>}
    </>
  );
}

interface TransactionCategoryMatchProps {
  transaction: CategorizedTransaction;
  className?: string;
  getCategoryColor: (categoryId: string) => CategoryColor;
  getCategoryLabel: (categoryId: string) => string;
}

function TransactionCategoryMatch({
  transaction,
  className,
  getCategoryColor,
  getCategoryLabel,
}: TransactionCategoryMatchProps) {
  return (
    <CategoryMatchCell
      assignment={transaction.assignment}
      categoryId={transaction.categoryId}
      className={className}
      getCategoryColor={getCategoryColor}
      getCategoryLabel={getCategoryLabel}
      matchedCategoryIds={transaction.matchedCategoryIds}
    />
  );
}

function MobileTransactionList({
  transactions,
  getCategoryColor,
  getCategoryLabel,
}: MobileTransactionListProps) {
  return (
    <section
      className="border border-foreground"
      aria-labelledby="mobile-review-transactions-heading"
    >
      <div className="flex items-center justify-between gap-3 border-b p-3.5">
        <h2
          id="mobile-review-transactions-heading"
          className="font-mono text-sm font-bold tracking-tight uppercase"
        >
          Transaction details
        </h2>
        <p className="shrink-0 font-mono text-xs font-semibold text-muted-foreground uppercase">
          {transactions.length} Transactions
        </p>
      </div>
      <ul className="divide-y" aria-label="Transactions to review">
        {transactions.map((transaction) => {
          const creditDescriptionId = `mobile-review-${transaction.id}-credit-description`;
          const markerClass = transaction.categoryId
            ? getCategoryColorClass(getCategoryColor(transaction.categoryId))
            : "bg-warning";

          return (
            <li
              key={transaction.id}
              className={cn(
                "flex items-start gap-3 p-4",
                transaction.isExcluded && "bg-muted/70 text-muted-foreground",
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
                        {transaction.description}
                      </p>
                      <TransactionIndicators
                        transaction={transaction}
                        creditDescriptionId={creditDescriptionId}
                      />
                    </div>
                    <p className="mt-1 font-mono text-xs font-semibold uppercase text-muted-foreground">
                      {formatDate(transaction.transactionDate)}
                    </p>
                  </div>
                  <p className="max-w-[45%] shrink-0 text-right font-mono text-sm font-bold tabular-nums wrap-anywhere">
                    {formatMoney(transaction.amount)}
                  </p>
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                  <TransactionCategoryMatch
                    transaction={transaction}
                    className="max-w-full whitespace-normal wrap-anywhere"
                    getCategoryColor={getCategoryColor}
                    getCategoryLabel={getCategoryLabel}
                  />
                  <AssignmentBadge assignment={transaction.assignment} />
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
