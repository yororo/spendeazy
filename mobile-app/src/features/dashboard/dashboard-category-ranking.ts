import type { DashboardReport } from '@/api/dashboard-report-api-client';
import { compareMoney } from './dashboard-format.ts';

// Monthly overruns count individually; annual budgets use calendar-year usage.
export function rankChartCategories(report: DashboardReport) {
  const cents = (amount: string) => BigInt(amount.replace('.', ''));
  const positive = (amount: bigint) => amount > 0n ? amount : 0n;
  const ranked = report.categoryExpenses.map((category) => {
    const monthlyOverrun = category.months.reduce((total, month) =>
      total + (month.monthlyBudgetAmount === null ? 0n
        : positive(cents(month.actualAmount) - cents(month.monthlyBudgetAmount))), 0n);
    const annualOverrun = report.budgetChecks.yearly
      .filter((check) => check.categoryId === category.categoryId)
      .reduce((total, check) => total + positive(cents(check.actualAmount) - cents(check.limitAmount)), 0n);
    return { category, overrun: monthlyOverrun + annualOverrun };
  });
  return ranked.sort((left, right) =>
    (left.overrun < right.overrun ? 1 : left.overrun > right.overrun ? -1 : 0) ||
    compareMoney(right.category.actualAmount, left.category.actualAmount) ||
    left.category.name.localeCompare(right.category.name),
  ).map(({ category }) => category);
}
