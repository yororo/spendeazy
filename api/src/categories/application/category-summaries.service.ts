import { Inject, Injectable } from '@nestjs/common';
import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import { daysInMonth } from '../../http/domain-date';
import type { BudgetPeriod } from './budget-store';
import {
  isCategorySummaryPeriod,
  isValidSummaryPeriodFields,
  isValidSummaryYear,
} from './category-summary-input';
import {
  CATEGORY_SUMMARY_STORE,
  type CategorySummaryData,
  type CategorySummaryStore,
} from './category-summary-store';
import { normalizeMoney, subtractMoney } from './money-arithmetic';

export interface CategorySummaryInput {
  period: BudgetPeriod;
  year: string;
  month?: string;
}

export interface CategorySummaryItem {
  categoryId: string;
  name: string;
  isActive: boolean;
  totalAmount: string;
  transactionCount: string;
  budgetAmount: string | null;
  remainingAmount: string | null;
}

export interface CategorySummaryResult {
  period: BudgetPeriod;
  year: string;
  month: string | null;
  categories: CategorySummaryItem[];
  uncategorizedTotal: string;
  uncategorizedCount: string;
}

@Injectable()
export class CategorySummariesService {
  constructor(
    @Inject(CATEGORY_SUMMARY_STORE)
    private readonly categorySummaryStore: CategorySummaryStore,
  ) {}

  async getCategorySummaryInSpace(
    spaceId: string,
    input: CategorySummaryInput,
  ): Promise<CategorySummaryResult> {
    const calendarPeriod = getCalendarPeriod(input);
    const summary = await this.categorySummaryStore.findSummary({
      spaceId,
      fromDate: calendarPeriod.fromDate,
      toDate: calendarPeriod.toDate,
    });

    return projectCategorySummary(summary, input);
  }
}

function projectCategorySummary(
  summary: CategorySummaryData,
  input: CategorySummaryInput,
): CategorySummaryResult {
  return {
    period: input.period,
    year: input.year,
    month: input.period === 'monthly' ? input.month! : null,
    categories: summary.categories
      .filter(
        (category) =>
          category.categoryIsActive ||
          normalizeMoney(category.totalAmount) !== '0.00',
      )
      .sort((left, right) => compareIds(left.categoryId, right.categoryId))
      .map((category) => toCategorySummaryItem(category, input.period)),
    uncategorizedTotal: normalizeMoney(summary.uncategorizedAmount),
    uncategorizedCount: normalizeCount(summary.uncategorizedCount),
  };
}

function toCategorySummaryItem(
  category: CategorySummaryData['categories'][number],
  requestedPeriod: BudgetPeriod,
): CategorySummaryItem {
  const totalAmount = normalizeMoney(category.totalAmount);
  const budgetAmount =
    category.budgetPeriod === requestedPeriod && category.budgetAmount !== null
      ? normalizeMoney(category.budgetAmount)
      : null;

  return {
    categoryId: category.categoryId,
    name: category.categoryName,
    isActive: category.categoryIsActive,
    totalAmount,
    transactionCount: normalizeCount(category.transactionCount),
    budgetAmount,
    remainingAmount:
      budgetAmount === null ? null : subtractMoney(budgetAmount, totalAmount),
  };
}

function getCalendarPeriod(input: CategorySummaryInput): {
  fromDate: string;
  toDate: string;
} {
  validateInput(input);

  if (input.period === 'yearly') {
    return {
      fromDate: `${input.year}-01-01`,
      toDate: `${input.year}-12-31`,
    };
  }

  const month = Number(input.month);
  const lastDay = daysInMonth(Number(input.year), month);

  return {
    fromDate: `${input.year}-${input.month}-01`,
    toDate: `${input.year}-${input.month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function validateInput(input: CategorySummaryInput): void {
  const details: ErrorDetail[] = [];
  if (!isCategorySummaryPeriod(input.period)) {
    details.push({
      field: '/period',
      code: 'invalid_format',
      message: 'Period must be monthly or yearly',
    });
  }
  if (!isValidSummaryYear(input.year)) {
    details.push({
      field: '/year',
      code: 'invalid_format',
      message: 'Year must contain exactly four digits',
    });
  }

  if (!isValidSummaryPeriodFields(input)) {
    details.push({
      field: '/month',
      code: input.period === 'yearly' ? 'not_allowed' : 'invalid_format',
      message:
        input.period === 'yearly'
          ? 'Yearly summaries do not accept a month'
          : 'Monthly summaries require a month from 01 through 12',
    });
  }

  if (details.length > 0) {
    throw new CategorySummaryValidationError(details);
  }
}

function compareIds(left: string, right: string): number {
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function normalizeCount(value: string): string {
  return BigInt(value).toString();
}

class CategorySummaryValidationError extends ApplicationError {
  constructor(details: ErrorDetail[]) {
    super('VALIDATION_FAILED', 'The request contains invalid fields.', details);
  }
}
