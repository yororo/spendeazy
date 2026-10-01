import { formatReportingPeriod, type ReportingPeriod } from "@/shared/reporting-period";
import { centsToMoney, formatMoney } from "@/shared/money";

type BudgetStatus = "within" | "near" | "limit" | "over";

const budgetStatusLabels: Record<BudgetStatus, string> = {
  within: "Within Budget",
  near: "Nearing Budget",
  limit: "At Budget Limit",
  over: "Over Budget",
};

function getBudgetStatus(spentCents: number, limitCents: number): BudgetStatus {
  if (spentCents > limitCents) return "over";
  if (spentCents === limitCents) return "limit";
  if (spentCents * 5 >= limitCents * 4) return "near";
  return "within";
}

function describeBudget(spentCents: number, limitCents: number): string {
  if (spentCents === 0) {
    return `No spending recorded · ${formatMoney(centsToMoney(limitCents))} current monthly limit`;
  }
  const status = getBudgetStatus(spentCents, limitCents);
  const difference = limitCents - spentCents;
  return `${budgetStatusLabels[status]} · ${formatMoney(centsToMoney(Math.abs(difference)))} ${difference < 0 ? "over" : "remaining"}`;
}

export { budgetStatusLabels, describeBudget, getBudgetStatus };
export type { BudgetStatus };

interface BudgetReviewHistory {
  readonly months: readonly { readonly period: ReportingPeriod; readonly amountCents: number }[];
}

function countBudgetBreaches(history: BudgetReviewHistory, limit: number | null): number {
  return limit === null ? 0 : history.months.filter(({ amountCents }) => amountCents > limit).length;
}

function describeBudgetReview(history: BudgetReviewHistory, limit: number | null): string {
  const count = countBudgetBreaches(history, limit);
  const comparison = limit === null ? `${history.months.length} eligible recorded months. No current monthly limit. Yearly Budgets are preserved.` : `${count} of ${history.months.length} eligible recorded months exceeded the current monthly limit of ${formatMoney(centsToMoney(limit))}.`;
  return `${comparison} Completed months only; months without recorded Category spending are excluded. Historical comparisons use the current recurring limit. ${history.months.map((month) => `${formatReportingPeriod(month.period)}: ${formatMoney(centsToMoney(month.amountCents))}`).join("; ")}`;
}

export { countBudgetBreaches, describeBudgetReview };
export type { BudgetReviewHistory };
