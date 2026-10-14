import type { CategoryColor } from "@/shared/category";
import { centsToMoney, moneyToCents } from "@/shared/money";

import type { CategorizedStatementEntry } from "./statement-categorizer";
import { compareStatementRows, type StatementSort } from "./statement-review-order";
import { isIncludedStatementEntry } from "./statement-import-utils";

interface CategoryBreakdownItem {
  readonly categoryId: string;
  readonly amount: number;
  readonly label: string;
  readonly color: CategoryColor;
  readonly share: number;
}

interface StatementReviewData {
  readonly includedExpenses: readonly CategorizedStatementEntry[];
  readonly excludedExpenses: readonly CategorizedStatementEntry[];
  readonly unmappedExpenses: readonly CategorizedStatementEntry[];
  readonly ambiguousExpenses: readonly CategorizedStatementEntry[];
  readonly categorizedExpenses: readonly CategorizedStatementEntry[];
  readonly ruleCount: number;
  readonly manualCount: number;
  readonly excludedCount: number;
  readonly debitTotal: number;
  readonly averageDebit: number;
  readonly categoryBreakdown: readonly CategoryBreakdownItem[];
  readonly categorizedDebitTotal: number;
  readonly largestCategoryAmount: number;
  readonly hasUnmappedExpenses: boolean;
}

function createStatementReviewData(
  entries: readonly CategorizedStatementEntry[],
  sort: StatementSort,
  getCategoryLabel: (categoryId: string) => string,
  getCategoryColor: (categoryId: string) => CategoryColor,
): StatementReviewData {
  const orderedExpenses = [...entries].sort((a, b) => compareStatementRows(a, b, sort));
  const excludedExpenses = orderedExpenses.filter((row) => row.isExcluded);
  const includedExpenses = orderedExpenses.filter(
    isIncludedStatementEntry,
  );
  const unmappedExpenses = includedExpenses.filter(
    (expense) => expense.categoryId === null,
  );
  const ambiguousExpenses = includedExpenses.filter(
    (expense) => expense.assignment === "ambiguous",
  );
  const categorizedExpenses = includedExpenses.filter(
    (expense) => expense.categoryId !== null,
  );
  const ruleCount = categorizedExpenses.filter(
    (expense) => expense.assignment === "rule",
  ).length;
  const manualCount = categorizedExpenses.filter(
    (expense) => expense.assignment === "manual",
  ).length;
  const excludedCount = entries.length - includedExpenses.length;
  const debitTotal = centsToMoney(includedExpenses.reduce(
    (total, expense) => total + moneyToCents(Math.abs(expense.amount)),
    0,
  ));
  const averageDebit =
    includedExpenses.length > 0
      ? debitTotal / includedExpenses.length
      : 0;

  const categoryTotals = new Map<string, number>();
  includedExpenses.forEach((expense) => {
    if (!expense.categoryId) return;

    categoryTotals.set(
      expense.categoryId,
      (categoryTotals.get(expense.categoryId) ?? 0) +
        Math.abs(expense.amount),
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
  const hasUnmappedExpenses = unmappedExpenses.length > 0;

  return {
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
  };
}

export { createStatementReviewData };
export type { CategoryBreakdownItem };
