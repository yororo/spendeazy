import { BUDGET_PERIODS, type BudgetPeriod } from './budget-store';

export const SUMMARY_PERIODS = BUDGET_PERIODS;
export const SUMMARY_YEAR_PATTERN = /^\d{4}$/u;
export const SUMMARY_MONTH_PATTERN = /^(0[1-9]|1[0-2])$/u;

export interface CategorySummaryInputFields {
  period?: unknown;
  year?: unknown;
  month?: unknown;
}

export function isCategorySummaryPeriod(value: unknown): value is BudgetPeriod {
  return (
    typeof value === 'string' &&
    (SUMMARY_PERIODS as readonly string[]).includes(value)
  );
}

export function isValidSummaryPeriodFields(
  input: CategorySummaryInputFields,
): boolean {
  if (input.period === 'monthly') {
    return (
      typeof input.month === 'string' && SUMMARY_MONTH_PATTERN.test(input.month)
    );
  }

  if (input.period === 'yearly') {
    return input.month === undefined;
  }

  return true;
}

export function isValidSummaryYear(value: unknown): value is string {
  return typeof value === 'string' && SUMMARY_YEAR_PATTERN.test(value);
}
