import { countBudgetBreaches } from "@/shared/budget";
import { getCurrentReportingPeriod, type ReportingPeriod } from "@/shared/reporting-period";
import type { InsightsCategory } from "./insights-service";
import type { PatternExpense } from "./spending-patterns";

interface BudgetReview {
  readonly categoryId: string;
  readonly label: string;
  readonly monthlyBudgetCents: number | null;
  readonly months: readonly { readonly period: ReportingPeriod; readonly amountCents: number }[];
  readonly breachCount: number;
  readonly suggestReview: boolean;
}

function createBudgetReviews(period: ReportingPeriod, categories: readonly InsightsCategory[], expenses: readonly PatternExpense[], now = new Date()): readonly BudgetReview[] {
  const current = getCurrentReportingPeriod(now);
  return categories.filter((category) => category.id !== null).map((category) => {
    const totals = new Map<ReportingPeriod, number>();
    for (const expense of expenses) {
      const month = expense.date.slice(0, 7) as ReportingPeriod;
      if (expense.categoryId !== category.id || expense.amountCents <= 0 || month > period || month >= current) continue;
      totals.set(month, (totals.get(month) ?? 0) + expense.amountCents);
    }
    const months = [...totals].sort(([a], [b]) => b.localeCompare(a)).slice(0, 6).map(([month, amountCents]) => ({ period: month, amountCents }));
    const breachCount = countBudgetBreaches({ months }, category.monthlyBudgetCents);
    return { categoryId: category.id!, label: category.label, monthlyBudgetCents: category.monthlyBudgetCents, months, breachCount, suggestReview: breachCount >= 3 };
  });
}

export { createBudgetReviews };
export type { BudgetReview };
