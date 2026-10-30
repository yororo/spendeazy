import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import { daysInMonth } from '../../http/domain-date';
import { todayInManila } from '../../http/manila-clock';
import { MONTHS_PER_YEAR } from './dashboard-report-constants';

export type DashboardView = 'monthly' | 'yearly';

export interface DashboardReportInput {
  readonly view?: unknown;
  readonly endMonth?: unknown;
  readonly months?: unknown;
  readonly year?: unknown;
  readonly chartCategoryId?: unknown;
}

export interface ResolvedDashboardRange {
  readonly view: DashboardView;
  readonly fromDate: string;
  readonly toDate: string;
  readonly today: string;
  readonly inProgress: boolean;
  readonly months: readonly string[];
  readonly years: readonly string[];
}

const MONTH_VALUE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/u;
const YEAR_VALUE_PATTERN = /^\d{4}$/u;
const CATEGORY_ID_PATTERN = /^[1-9]\d*$/u;

export function resolveDashboardRange(
  input: DashboardReportInput,
  now: Date,
): ResolvedDashboardRange {
  const today = todayInManila(now);
  const todayYear = today.slice(0, 4);
  const todayMonth = today.slice(0, 7);
  const view = input.view === undefined ? 'monthly' : input.view;
  const details: ErrorDetail[] = [];

  if (view !== 'monthly' && view !== 'yearly') {
    details.push({
      field: '/view',
      code: 'invalid_value',
      message: 'View must be monthly or yearly',
    });
  }

  const chartCategoryIds = normalizeChartCategoryIds(input.chartCategoryId);
  if (chartCategoryIds === null) {
    details.push({
      field: '/chartCategoryId',
      code: 'invalid_format',
      message: 'Each chartCategoryId must be a positive integer identifier',
    });
  }

  if (view === 'monthly') {
    if (input.year !== undefined) {
      details.push({
        field: '/year',
        code: 'not_allowed',
        message: 'Monthly dashboard views do not accept year',
      });
    }
    const monthsInput = input.months === undefined ? '1' : input.months;
    if (
      typeof monthsInput !== 'string' ||
      !['1', '3', '6'].includes(monthsInput)
    ) {
      details.push({
        field: '/months',
        code: 'invalid_value',
        message: 'Months must be 1, 3, or 6',
      });
    }
    const endMonth =
      input.endMonth === undefined ? previousMonth(todayMonth) : input.endMonth;
    if (typeof endMonth !== 'string' || !MONTH_VALUE_PATTERN.test(endMonth)) {
      details.push({
        field: '/endMonth',
        code: 'invalid_format',
        message: 'End month must use the YYYY-MM format',
      });
    } else if (endMonth > todayMonth) {
      details.push({
        field: '/endMonth',
        code: 'future_value',
        message: 'End month cannot be in the future',
      });
    }

    if (details.length > 0) throw new DashboardReportValidationError(details);

    const monthCount = Number(monthsInput);
    const normalizedEndMonth = endMonth as string;
    const [year, month] = normalizedEndMonth.split('-').map(Number);
    const start = shiftMonth(year, month, 1 - monthCount);
    const fromDate = formatMonth(start.year, start.month) + '-01';
    const currentMonthSelected = normalizedEndMonth === todayMonth;
    const toDate = currentMonthSelected
      ? today
      : `${normalizedEndMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
    const months = Array.from({ length: monthCount }, (_, index) => {
      const point = shiftMonth(start.year, start.month, index);
      return formatMonth(point.year, point.month);
    });
    return {
      view: 'monthly',
      fromDate,
      toDate,
      today,
      inProgress: currentMonthSelected,
      months,
      years: [...new Set(months.map((monthValue) => monthValue.slice(0, 4)))],
    };
  }

  if (input.months !== undefined) {
    details.push({
      field: '/months',
      code: 'not_allowed',
      message: 'Yearly dashboard views do not accept months',
    });
  }
  if (input.endMonth !== undefined) {
    details.push({
      field: '/endMonth',
      code: 'not_allowed',
      message: 'Yearly dashboard views do not accept endMonth',
    });
  }
  const year = input.year === undefined ? todayYear : input.year;
  if (typeof year !== 'string' || !YEAR_VALUE_PATTERN.test(year)) {
    details.push({
      field: '/year',
      code: 'invalid_format',
      message: 'Year must contain exactly four digits',
    });
  } else if (year > todayYear) {
    details.push({
      field: '/year',
      code: 'future_value',
      message: 'Year cannot be in the future',
    });
  }

  if (details.length > 0) throw new DashboardReportValidationError(details);

  const normalizedYear = year as string;
  const currentYearSelected = normalizedYear === todayYear;
  const lastMonth = currentYearSelected
    ? Number(today.slice(5, 7))
    : MONTHS_PER_YEAR;
  const months = Array.from({ length: lastMonth }, (_, index) =>
    formatMonth(Number(normalizedYear), index + 1),
  );
  return {
    view: 'yearly',
    fromDate: `${normalizedYear}-01-01`,
    toDate: currentYearSelected ? today : `${normalizedYear}-12-31`,
    today,
    inProgress: currentYearSelected,
    months,
    years: [normalizedYear],
  };
}

export function normalizeChartCategoryIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  if (
    values.some(
      (item) => typeof item !== 'string' || !CATEGORY_ID_PATTERN.test(item),
    )
  ) {
    return null;
  }
  return [...new Set(values as string[])];
}

export function previousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const previous = shiftMonth(year, monthNumber, -1);
  return formatMonth(previous.year, previous.month);
}

export function endOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${month}-${String(daysInMonth(year, monthNumber)).padStart(2, '0')}`;
}

export function formatMonth(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function shiftMonth(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const index = year * MONTHS_PER_YEAR + month - 1 + offset;
  return {
    year: Math.floor(index / MONTHS_PER_YEAR),
    month:
      (((index % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR) + 1,
  };
}

export class DashboardReportValidationError extends ApplicationError {
  constructor(details: ErrorDetail[]) {
    super('VALIDATION_FAILED', 'The request contains invalid fields.', details);
  }
}
