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
