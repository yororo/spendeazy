import type { DashboardReport } from '@/api/dashboard-report-api-client';
import { compareMoney, formatPhp } from './dashboard-format.ts';

type Category = DashboardReport['categoryExpenses'][number];
function cents(value: string) { return BigInt(value.replace('.', '')); }
function decimal(value: bigint) { return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`; }

export function budgetBalance(actual: string, limit: string): string {
  if (compareMoney(limit, '0.00') <= 0) return 'No budget';
  const difference = cents(actual) - cents(limit);
  return difference === 0n ? 'At limit' : `${formatPhp(decimal(difference < 0n ? -difference : difference))} ${difference > 0n ? 'over' : 'remaining'}`;
}

export function rankReviewCategories(categories: readonly Category[]): Category[] {
  const over = (category: Category) => category.months.some((month) => month.monthlyBudgetAmount !== null && compareMoney(month.actualAmount, month.monthlyBudgetAmount) > 0);
  return [...categories].sort((left, right) => Number(over(right)) - Number(over(left)) || compareMoney(right.actualAmount, left.actualAmount) || left.name.localeCompare(right.name));
}

export function categoryBudgetDetail(category: Category): string {
  const monthly = category.months.filter((month) => month.monthlyBudgetAmount !== null);
  if (monthly.length === 1 && category.months.length === 1) {
    const month = monthly[0];
    return `${formatPhp(month.actualAmount)} / ${formatPhp(month.monthlyBudgetAmount!)} · ${budgetBalance(month.actualAmount, month.monthlyBudgetAmount!)}`;
  }
  if (monthly.length > 0) {
    const limit = monthly[0].monthlyBudgetAmount!;
    return `${formatPhp(category.actualAmount)} total · ${formatPhp(limit)} monthly budget`;
  }
  return `${formatPhp(category.actualAmount)} · ${category.budget?.period === 'yearly' || category.months.some((month) => month.annualBudgetAmount !== null) ? 'Annual budget' : 'No budget'}`;
}
