import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  MANILA_CLOCK,
  systemManilaClock,
  type ManilaClock,
} from '../../http/manila-clock';
import {
  endOfMonth,
  normalizeChartCategoryIds,
  resolveDashboardRange,
  type DashboardReportInput,
  type ResolvedDashboardRange,
} from './dashboard-report-input';
import {
  DASHBOARD_REPORT_STORE,
  type DashboardReportCategory,
  type DashboardReportData,
  type DashboardReportExpense,
  type DashboardReportStore,
} from './dashboard-report-store';
import { MONTHS_PER_YEAR } from './dashboard-report-constants';

type Rational = { numerator: bigint; denominator: bigint };
type ValueWithExact = { exact: ExactValue; amount: string };
type ExactValue = { numerator: string; denominator: string };
type ExpenseFilter = { fromDate: string; toDate: string; categoryId?: string };
type BudgetStatus = 'normal' | 'nearing' | 'at_limit' | 'over';

const CENTS_PER_PESO = 100n;
const PERCENTAGE_SCALE = 100n;
const NEARING_BUDGET_PERCENTAGE = 80n;

export interface DashboardReportResponse {
  readonly range: {
    readonly view: 'monthly' | 'yearly';
    readonly fromDate: string;
    readonly toDate: string;
    readonly today: string;
    readonly timezone: 'Asia/Manila';
    readonly currency: 'PHP';
    readonly configurationBasis: 'current';
    readonly inProgress: boolean;
    readonly asOf: string;
  };
  readonly summary: {
    readonly actualAmount: string;
    readonly expenseCount: string;
    readonly planned: ValueWithExact & {
      readonly months: number;
      readonly monthlyEquivalent: ValueWithExact;
      readonly annualEquivalent: ValueWithExact;
    };
    readonly comparison: {
      readonly direction:
        'above_plan' | 'below_plan' | 'equal_plan' | 'no_plan';
      readonly difference: ValueWithExact;
      readonly percentage: ValueWithExact | null;
    };
    readonly highestCategory: {
      readonly categoryId: string;
      readonly name: string;
      readonly amount: string;
      readonly expenseFilter: ExpenseFilter;
    } | null;
    readonly statementImports: {
      readonly count: string;
      readonly latestConfirmedAt: string | null;
      readonly filter: { readonly fromDate: string; readonly toDate: string };
    };
  };
  readonly monthlyExpenses: readonly {
    readonly month: string;
    readonly fromDate: string;
    readonly toDate: string;
    readonly inProgress: boolean;
    readonly actualAmount: string;
    readonly expenseCount: string;
    readonly expenseFilter: ExpenseFilter;
  }[];
  readonly categoryExpenses: readonly {
    readonly categoryId: string;
    readonly name: string;
    readonly isActive: boolean;
    readonly iconKey: string;
    readonly colorKey: string | null;
    readonly actualAmount: string;
    readonly expenseCount: string;
    readonly budget: {
      readonly period: 'monthly' | 'yearly';
      readonly amount: string;
    } | null;
    readonly months: readonly {
      readonly month: string;
      readonly actualAmount: string;
      readonly expenseCount: string;
      readonly budgetStatus: BudgetStatus | null;
      readonly monthlyBudgetAmount: string | null;
      readonly annualBudgetAmount: string | null;
      readonly expenseFilter: ExpenseFilter;
    }[];
  }[];
  readonly budgetChecks: {
    readonly monthly: readonly {
      readonly categoryId: string;
      readonly name: string;
      readonly budgetAmount: string;
      readonly overBudgetMonths: number;
      readonly eligibleMonths: number;
      readonly expenseFilter: ExpenseFilter | null;
    }[];
    readonly yearly: readonly {
      readonly categoryId: string;
      readonly name: string;
      readonly year: string;
      readonly actualAmount: string;
      readonly limitAmount: string;
      readonly status: BudgetStatus;
      readonly usageFromDate: string;
      readonly usageToDate: string;
      readonly expenseFilter: ExpenseFilter;
    }[];
  };
}

@Injectable()
export class DashboardReportService {
  constructor(
    @Inject(DASHBOARD_REPORT_STORE)
    private readonly reportStore: DashboardReportStore,
    @Optional()
    @Inject(MANILA_CLOCK)
    private readonly clock: ManilaClock = systemManilaClock,
  ) {}

  async getDashboardReportInSpace(
    spaceId: string,
    input: DashboardReportInput,
  ): Promise<DashboardReportResponse> {
    const asOf = this.clock();
    const range = resolveDashboardRange(input, asOf);
    const chartCategoryIds =
      normalizeChartCategoryIds(input.chartCategoryId) ?? [];
    const reportFromYear = `${range.years[0]}-01-01`;
    const reportToYear = range.years
      .map((year) =>
        year < range.today.slice(0, 4) ? `${year}-12-31` : range.today,
      )
      .sort()
      .at(-1)!;
    const data = await this.reportStore.readDashboardReport({
      spaceId,
      expenseFromDate: reportFromYear,
      expenseToDate: reportToYear,
      importFromDate: manilaMidnight(range.fromDate),
      importToDateExclusive: manilaMidnight(addDays(range.toDate, 1)),
    });
    return projectDashboardReport(data, range, chartCategoryIds, asOf);
  }
}

function projectDashboardReport(
  data: DashboardReportData,
  range: ResolvedDashboardRange,
  chartCategoryIds: readonly string[],
  asOf: Date,
): DashboardReportResponse {
  const categoriesById = new Map(
    data.categories.map((category) => [category.categoryId, category]),
  );
  const selectedExpenses = data.expenses.filter(
    (expense) =>
      expense.expenseDate >= range.fromDate &&
      expense.expenseDate <= range.toDate,
  );
  const allMonthlyCategoryTotals = aggregateExpensesByMonthAndCategory(
    data.expenses,
  );
  const selectedMonthlyTotals = aggregateExpensesByMonth(selectedExpenses);
  const selectedMonthlyCategoryTotals =
    aggregateExpensesByMonthAndCategory(selectedExpenses);
  const selectedCategoryTotals = aggregateExpensesByCategory(selectedExpenses);
  const actualCents = sumExpenseCents(selectedExpenses);
  const monthlyEquivalent = getMonthlyPlan(data.categories);
  const planMonths = range.months.length;
  const planned = multiply(monthlyEquivalent, BigInt(planMonths));
  const annualEquivalent = multiply(monthlyEquivalent, BigInt(MONTHS_PER_YEAR));
  const difference = subtract(fromCents(actualCents), planned);
  const direction =
    planned.numerator === 0n
      ? 'no_plan'
      : difference.numerator > 0n
        ? 'above_plan'
        : difference.numerator < 0n
          ? 'below_plan'
          : 'equal_plan';
  const percentage =
    planned.numerator === 0n
      ? null
      : multiply(
          divideRational(absRational(difference), planned),
          PERCENTAGE_SCALE,
        );
  const categoryExpenses = data.categories
    .filter((category) => {
      if (category.isActive) return true;
      return (
        (selectedCategoryTotals.get(category.categoryId)?.count ?? 0n) > 0n
      );
    })
    .filter(
      (category) =>
        chartCategoryIds.length === 0 ||
        chartCategoryIds.includes(category.categoryId),
    )
    .map((category) =>
      projectCategory(
        category,
        range,
        selectedCategoryTotals,
        selectedMonthlyCategoryTotals,
      ),
    );

  const highestCategory = [...selectedCategoryTotals.entries()]
    .filter(([, total]) => total.count > 0n)
    .sort(([leftId, left], [rightId, right]) => {
      if (left.cents !== right.cents) return left.cents > right.cents ? -1 : 1;
      return compareCategories(
        categoriesById.get(leftId),
        categoriesById.get(rightId),
      );
    })[0];

  const latestImport = data.imports.at(-1)?.importedAt ?? null;
  return {
    range: {
      view: range.view,
      fromDate: range.fromDate,
      toDate: range.toDate,
      today: range.today,
      timezone: 'Asia/Manila',
      currency: 'PHP',
      configurationBasis: 'current',
      inProgress: range.inProgress,
      asOf: asOf.toISOString(),
    },
    summary: {
      actualAmount: formatCents(actualCents),
      expenseCount: selectedExpenses.length.toString(),
      planned: {
        exact: toExact(planned),
        amount: formatRationalMoney(planned),
        months: planMonths,
        monthlyEquivalent: valueWithExact(monthlyEquivalent),
        annualEquivalent: valueWithExact(annualEquivalent),
      },
      comparison: {
        direction,
        difference: valueWithExact(difference),
        percentage: percentage === null ? null : valueWithExact(percentage, 1),
      },
      highestCategory:
        highestCategory === undefined
          ? null
          : {
              categoryId: highestCategory[0],
              name: categoriesById.get(highestCategory[0])?.name ?? '',
              amount: formatCents(highestCategory[1].cents),
              expenseFilter: {
                fromDate: range.fromDate,
                toDate: range.toDate,
                categoryId: highestCategory[0],
              },
            },
      statementImports: {
        count: data.imports.length.toString(),
        latestConfirmedAt: latestImport?.toISOString() ?? null,
        filter: { fromDate: range.fromDate, toDate: range.toDate },
      },
    },
    monthlyExpenses: range.months.map((month) => {
      const fromDate = `${month}-01`;
      const toDate =
        month === range.toDate.slice(0, 7) ? range.toDate : endOfMonth(month);
      const total = selectedMonthlyTotals.get(month) ?? emptyAggregate();
      return {
        month,
        fromDate,
        toDate,
        inProgress: month === range.today.slice(0, 7) && range.inProgress,
        actualAmount: formatCents(total.cents),
        expenseCount: total.count.toString(),
        expenseFilter: { fromDate, toDate },
      };
    }),
    categoryExpenses,
    budgetChecks: {
      monthly: projectMonthlyBudgetChecks(
        data.categories,
        range,
        allMonthlyCategoryTotals,
      ),
      yearly: projectYearlyBudgetChecks(data.categories, range, data.expenses),
    },
  };
}

function projectCategory(
  category: DashboardReportCategory,
  range: ResolvedDashboardRange,
  categoryTotals: Map<string, Aggregate>,
  monthlyCategoryTotals: Map<string, Aggregate>,
): DashboardReportResponse['categoryExpenses'][number] {
  const total = categoryTotals.get(category.categoryId) ?? emptyAggregate();
  const hasCurrentBudget = category.isActive && category.budgetAmount !== null;
  return {
    categoryId: category.categoryId,
    name: category.name,
    isActive: category.isActive,
    iconKey: category.iconKey,
    colorKey: category.colorKey,
    actualAmount: formatCents(total.cents),
    expenseCount: total.count.toString(),
    budget:
      hasCurrentBudget && category.budgetPeriod !== null
        ? {
            period: category.budgetPeriod,
            amount: formatMoney(category.budgetAmount),
          }
        : null,
    months: range.months.map((month) => {
      const monthTotal =
        monthlyCategoryTotals.get(
          monthAndCategory(month, category.categoryId),
        ) ?? emptyAggregate();
      const monthlyBudgetAmount =
        category.isActive && category.budgetPeriod === 'monthly'
          ? formatMoney(category.budgetAmount!)
          : null;
      const annualBudgetAmount =
        category.isActive && category.budgetPeriod === 'yearly'
          ? formatMoney(category.budgetAmount!)
          : null;
      return {
        month,
        actualAmount: formatCents(monthTotal.cents),
        expenseCount: monthTotal.count.toString(),
        budgetStatus:
          monthlyBudgetAmount === null
            ? null
            : getBudgetStatus(
                monthTotal.cents,
                moneyToCents(monthlyBudgetAmount),
              ),
        monthlyBudgetAmount,
        annualBudgetAmount,
        expenseFilter: {
          fromDate: `${month}-01`,
          toDate:
            month === range.toDate.slice(0, 7)
              ? range.toDate
              : endOfMonth(month),
          categoryId: category.categoryId,
        },
      };
    }),
  };
}

function projectMonthlyBudgetChecks(
  categories: readonly DashboardReportCategory[],
  range: ResolvedDashboardRange,
  monthlyCategoryTotals: Map<string, Aggregate>,
): DashboardReportResponse['budgetChecks']['monthly'] {
  const eligibleMonths = range.months.filter(
    (month) => !(range.inProgress && month === range.today.slice(0, 7)),
  );
  return categories
    .filter(
      (category) =>
        category.isActive &&
        category.budgetPeriod === 'monthly' &&
        category.budgetAmount !== null,
    )
    .map((category) => ({
      categoryId: category.categoryId,
      name: category.name,
      budgetAmount: formatMoney(category.budgetAmount!),
      overBudgetMonths: eligibleMonths.filter((month) => {
        const actual =
          monthlyCategoryTotals.get(
            monthAndCategory(month, category.categoryId),
          )?.cents ?? 0n;
        return actual > moneyToCents(category.budgetAmount!);
      }).length,
      eligibleMonths: eligibleMonths.length,
      expenseFilter:
        eligibleMonths.length === 0
          ? null
          : {
              fromDate: `${eligibleMonths[0]}-01`,
              toDate: endOfMonth(eligibleMonths.at(-1)!),
              categoryId: category.categoryId,
            },
    }));
}

function projectYearlyBudgetChecks(
  categories: readonly DashboardReportCategory[],
  range: ResolvedDashboardRange,
  expenses: readonly DashboardReportExpense[],
): DashboardReportResponse['budgetChecks']['yearly'] {
  const yearlyCategories = categories.filter(
    (category) =>
      category.isActive &&
      category.budgetPeriod === 'yearly' &&
      category.budgetAmount !== null,
  );
  return range.years.flatMap((year) => {
    const usageFromDate = `${year}-01-01`;
    const usageToDate =
      year < range.today.slice(0, 4) ? `${year}-12-31` : range.today;
    return yearlyCategories.map((category) => {
      const actualCents = expenses
        .filter(
          (expense) =>
            expense.categoryId === category.categoryId &&
            expense.expenseDate >= usageFromDate &&
            expense.expenseDate <= usageToDate,
        )
        .reduce((total, expense) => total + moneyToCents(expense.amount), 0n);
      return {
        categoryId: category.categoryId,
        name: category.name,
        year,
        actualAmount: formatCents(actualCents),
        limitAmount: formatMoney(category.budgetAmount!),
        status: getBudgetStatus(
          actualCents,
          moneyToCents(category.budgetAmount!),
        ),
        usageFromDate,
        usageToDate,
        expenseFilter: {
          fromDate: usageFromDate,
          toDate: usageToDate,
          categoryId: category.categoryId,
        },
      };
    });
  });
}

interface Aggregate {
  cents: bigint;
  count: bigint;
}

function aggregateExpensesByMonth(
  expenses: readonly DashboardReportExpense[],
): Map<string, Aggregate> {
  const result = new Map<string, Aggregate>();
  for (const expense of expenses) {
    addAggregate(result, expense.expenseDate.slice(0, 7), expense);
  }
  return result;
}

function aggregateExpensesByCategory(
  expenses: readonly DashboardReportExpense[],
): Map<string, Aggregate> {
  const result = new Map<string, Aggregate>();
  for (const expense of expenses)
    addAggregate(result, expense.categoryId, expense);
  return result;
}

function addAggregate(
  result: Map<string, Aggregate>,
  key: string,
  expense: DashboardReportExpense,
): void {
  const aggregate = result.get(key) ?? emptyAggregate();
  aggregate.cents += moneyToCents(expense.amount);
  aggregate.count += 1n;
  result.set(key, aggregate);
}

function sumExpenseCents(expenses: readonly DashboardReportExpense[]): bigint {
  return expenses.reduce(
    (total, expense) => total + moneyToCents(expense.amount),
    0n,
  );
}

function getMonthlyPlan(
  categories: readonly DashboardReportCategory[],
): Rational {
  return categories
    .filter((category) => category.isActive && category.budgetAmount !== null)
    .reduce<Rational>(
      (total, category) => {
        const budget = fromCents(moneyToCents(category.budgetAmount!));
        return add(
          total,
          category.budgetPeriod === 'yearly' ? divide(budget, 12n) : budget,
        );
      },
      rational(0n, 1n),
    );
}

function getBudgetStatus(
  actualCents: bigint,
  limitCents: bigint,
): BudgetStatus {
  if (limitCents <= 0n) return actualCents > 0n ? 'over' : 'normal';
  if (actualCents > limitCents) return 'over';
  if (actualCents === limitCents) return 'at_limit';
  return actualCents * PERCENTAGE_SCALE >=
    limitCents * NEARING_BUDGET_PERCENTAGE
    ? 'nearing'
    : 'normal';
}

function compareCategories(
  left: DashboardReportCategory | undefined,
  right: DashboardReportCategory | undefined,
): number {
  const leftName = left?.name.toLocaleLowerCase('en') ?? '';
  const rightName = right?.name.toLocaleLowerCase('en') ?? '';
  if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  const leftId = BigInt(left?.categoryId ?? '0');
  const rightId = BigInt(right?.categoryId ?? '0');
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function monthAndCategory(month: string, categoryId: string): string {
  return `${month}:${categoryId}`;
}

function aggregateExpensesByMonthAndCategory(
  expenses: readonly DashboardReportExpense[],
): Map<string, Aggregate> {
  const result = new Map<string, Aggregate>();
  for (const expense of expenses) {
    addAggregate(
      result,
      monthAndCategory(expense.expenseDate.slice(0, 7), expense.categoryId),
      expense,
    );
  }
  return result;
}

function emptyAggregate(): Aggregate {
  return { cents: 0n, count: 0n };
}

function moneyToCents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match) throw new Error(`Invalid persisted money value: ${value}`);
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const cents = BigInt(match[2]) * CENTS_PER_PESO + BigInt(fraction || '0');
  return match[1] === '-' ? -cents : cents;
}

function formatMoney(value: string): string {
  return formatCents(moneyToCents(value));
}

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = absBigInt(cents);
  return `${sign}${absolute / CENTS_PER_PESO}.${String(absolute % CENTS_PER_PESO).padStart(2, '0')}`;
}

function fromCents(cents: bigint): Rational {
  return rational(cents, CENTS_PER_PESO);
}

function rational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n)
    throw new Error('A rational denominator cannot be zero');
  const sign = denominator < 0n ? -1n : 1n;
  const adjustedNumerator = numerator * sign;
  const adjustedDenominator = denominator * sign;
  const divisor = gcd(absBigInt(adjustedNumerator), adjustedDenominator);
  return {
    numerator: adjustedNumerator / divisor,
    denominator: adjustedDenominator / divisor,
  };
}

function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: Rational, right: Rational): Rational {
  return add(left, {
    numerator: -right.numerator,
    denominator: right.denominator,
  });
}

function multiply(value: Rational, factor: bigint | number): Rational {
  return rational(value.numerator * BigInt(factor), value.denominator);
}

function divide(value: Rational, divisor: bigint | number): Rational {
  return rational(value.numerator, value.denominator * BigInt(divisor));
}

function divideRational(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) throw new Error('Cannot divide by zero');
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function absRational(value: Rational): Rational {
  return value.numerator < 0n
    ? { numerator: -value.numerator, denominator: value.denominator }
    : value;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

function toExact(value: Rational): ExactValue {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

function valueWithExact(value: Rational, decimals = 2): ValueWithExact {
  return { exact: toExact(value), amount: formatRational(value, decimals) };
}

function formatRationalMoney(value: Rational): string {
  return formatRational(value, 2);
}

function formatRational(value: Rational, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const scaledNumerator = value.numerator * scale;
  const negative = scaledNumerator < 0n;
  const absolute = absBigInt(scaledNumerator);
  const quotient = absolute / value.denominator;
  const remainder = absolute % value.denominator;
  const rounded = quotient + (remainder * 2n >= value.denominator ? 1n : 0n);
  if (decimals === 0) return `${negative ? '-' : ''}${rounded}`;
  const fractional = String(rounded % scale).padStart(decimals, '0');
  return `${negative ? '-' : ''}${rounded / scale}.${fractional}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function manilaMidnight(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}
