import type { CategoryColor } from "@/shared/category";
import { centsToMoney, moneyToCents } from "@/shared/money";

import type { CategorizedTransaction } from "./statement-categorizer";
import { compareStatementRows, type StatementSort } from "./statement-review-order";
import { isIncludedStatementTransaction } from "./statement-import-utils";

interface CategoryBreakdownItem {
  readonly categoryId: string;
  readonly amount: number;
  readonly label: string;
  readonly color: CategoryColor;
  readonly share: number;
}

interface StatementReviewData {
  readonly includedTransactions: readonly CategorizedTransaction[];
  readonly excludedTransactions: readonly CategorizedTransaction[];
  readonly unmappedTransactions: readonly CategorizedTransaction[];
  readonly ambiguousTransactions: readonly CategorizedTransaction[];
  readonly categorizedTransactions: readonly CategorizedTransaction[];
  readonly ruleCount: number;
  readonly manualCount: number;
  readonly excludedCount: number;
  readonly debitTotal: number;
  readonly averageDebit: number;
  readonly categoryBreakdown: readonly CategoryBreakdownItem[];
  readonly categorizedDebitTotal: number;
  readonly largestCategoryAmount: number;
  readonly hasUnmappedTransactions: boolean;
}

function createStatementReviewData(
  transactions: readonly CategorizedTransaction[],
  sort: StatementSort,
  getCategoryLabel: (categoryId: string) => string,
  getCategoryColor: (categoryId: string) => CategoryColor,
): StatementReviewData {
  const orderedTransactions = [...transactions].sort((a, b) => compareStatementRows(a, b, sort));
  const excludedTransactions = orderedTransactions.filter((row) => row.isExcluded);
  const includedTransactions = orderedTransactions.filter(
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
  const debitTotal = centsToMoney(includedTransactions.reduce(
    (total, transaction) => total + moneyToCents(Math.abs(transaction.amount)),
    0,
  ));
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

  return {
    includedTransactions,
    excludedTransactions,
    unmappedTransactions,
    ambiguousTransactions,
    categorizedTransactions,
    ruleCount,
    manualCount,
    excludedCount,
    debitTotal,
    averageDebit,
    categoryBreakdown,
    categorizedDebitTotal,
    largestCategoryAmount,
    hasUnmappedTransactions,
  };
}

export { createStatementReviewData };
export type { CategoryBreakdownItem };
