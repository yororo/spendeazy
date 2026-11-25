import {
  authorizedRequest,
  type AuthorizedRequestOptions,
} from "./authorized-request.ts";
import { decodeApiResponse } from "./request-failure.ts";

export type HomeView = "monthly" | "yearly";
export type HomeBudgetStatus = "normal" | "nearing" | "at_limit" | "over";
export type HomeExact = { numerator: string; denominator: string };
export type HomeValue = { exact: HomeExact; amount: string };
export type HomeExpenseFilter = {
  fromDate: string;
  toDate: string;
  categoryId?: string;
};

export type HomeReport = {
  range: {
    view: HomeView;
    fromDate: string;
    toDate: string;
    today: string;
    timezone: "Asia/Manila";
    currency: "PHP";
    configurationBasis: "current";
    inProgress: boolean;
    asOf: string;
  };
  summary: {
    actualAmount: string;
    expenseCount: string;
    planned: HomeValue & {
      months: number;
      monthlyEquivalent: HomeValue;
      annualEquivalent: HomeValue;
    };
    comparison: {
      direction: "above_plan" | "below_plan" | "equal_plan" | "no_plan";
      difference: HomeValue;
      percentage: HomeValue | null;
    };
    highestCategory: {
      categoryId: string;
      name: string;
      amount: string;
      expenseFilter: HomeExpenseFilter;
    } | null;
    statementImports: {
      count: string;
      latestConfirmedAt: string | null;
      filter: { fromDate: string; toDate: string };
    };
  };
  monthlyExpenses: {
    month: string;
    fromDate: string;
    toDate: string;
    inProgress: boolean;
    actualAmount: string;
    expenseCount: string;
    expenseFilter: HomeExpenseFilter;
  }[];
  categoryExpenses: {
    categoryId: string;
    name: string;
    isActive: boolean;
    iconKey: string;
    colorKey: string | null;
    actualAmount: string;
    expenseCount: string;
    budget: { period: HomeView; amount: string } | null;
    months: {
      month: string;
      actualAmount: string;
      expenseCount: string;
      budgetStatus: HomeBudgetStatus | null;
      monthlyBudgetAmount: string | null;
      annualBudgetAmount: string | null;
      expenseFilter: HomeExpenseFilter;
    }[];
  }[];
  budgetChecks: {
    monthly: {
      categoryId: string;
      name: string;
      budgetAmount: string;
      overBudgetMonths: number;
      eligibleMonths: number;
      expenseFilter: HomeExpenseFilter | null;
    }[];
    yearly: {
      categoryId: string;
      name: string;
      year: string;
      actualAmount: string;
      limitAmount: string;
      status: HomeBudgetStatus;
      usageFromDate: string;
      usageToDate: string;
      expenseFilter: HomeExpenseFilter;
    }[];
  };
};

export type HomeReportQuery = {
  view: HomeView;
  endMonth?: string;
  months?: 1 | 3 | 6 | 12;
  year?: string;
  chartCategoryIds?: readonly string[];
};

export function createHomeReportApiClient(
  options: AuthorizedRequestOptions,
) {
  return {
    async getHomeReport(
      spaceId: string,
      query: HomeReportQuery,
    ): Promise<HomeReport> {
      const params = new URLSearchParams({ view: query.view });
      if (query.months !== undefined) params.set("months", String(query.months));
      if (query.endMonth !== undefined) params.set("endMonth", query.endMonth);
      if (query.year !== undefined) params.set("year", query.year);
      for (const categoryId of query.chartCategoryIds ?? []) {
        params.append("chartCategoryId", categoryId);
      }
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/reporting/home?${params.toString()}`,
      );
      return decodeApiResponse(() => readHomeReport(payload));
    },
  };
}

export function readHomeReport(value: unknown): HomeReport {
  return decodeApiResponse(() => {
    const root = readObject(value);
    const range = readObject(root.range);
    if (!(range.view === "monthly" || range.view === "yearly")) throw invalid();
    if (
      range.timezone !== "Asia/Manila" ||
      range.currency !== "PHP" ||
      range.configurationBasis !== "current"
    )
      throw invalid();
    const summary = readObject(root.summary);
    const planned = readObject(summary.planned);
    const monthlyEquivalent = readValue(planned.monthlyEquivalent);
    const annualEquivalent = readValue(planned.annualEquivalent);
    const comparison = readObject(summary.comparison);
    if (
      !(
        ["above_plan", "below_plan", "equal_plan", "no_plan"] as const
      ).includes(comparison.direction as never)
    )
      throw invalid();
    const highestCategory =
      summary.highestCategory === null
        ? null
        : readHighestCategory(summary.highestCategory);
    const imports = readObject(summary.statementImports);
    const budgetChecks = readObject(root.budgetChecks);
    if (
      !Array.isArray(root.monthlyExpenses) ||
      !Array.isArray(root.categoryExpenses) ||
      !Array.isArray(budgetChecks.monthly) ||
      !Array.isArray(budgetChecks.yearly)
    )
      throw invalid();
    return {
      range: {
        view: range.view,
        fromDate: readDate(range.fromDate),
        toDate: readDate(range.toDate),
        today: readDate(range.today),
        timezone: "Asia/Manila",
        currency: "PHP",
        configurationBasis: "current",
        inProgress: readBoolean(range.inProgress),
        asOf: readTimestamp(range.asOf),
      },
      summary: {
        actualAmount: readMoney(summary.actualAmount),
        expenseCount: readCount(summary.expenseCount),
        planned: {
          ...readValue(planned),
          months: readInteger(planned.months),
          monthlyEquivalent,
          annualEquivalent,
        },
        comparison: {
          direction:
            comparison.direction as HomeReport["summary"]["comparison"]["direction"],
          difference: readValue(comparison.difference),
          percentage:
            comparison.percentage === null
              ? null
              : readValue(comparison.percentage),
        },
        highestCategory,
        statementImports: {
          count: readCount(imports.count),
          latestConfirmedAt:
            imports.latestConfirmedAt === null
              ? null
              : readTimestamp(imports.latestConfirmedAt),
          filter: readDateFilter(imports.filter),
        },
      },
      monthlyExpenses: root.monthlyExpenses.map(readMonthlyExpense),
      categoryExpenses: root.categoryExpenses.map(readCategoryExpense),
      budgetChecks: {
        monthly: budgetChecks.monthly.map(readMonthlyCheck),
        yearly: budgetChecks.yearly.map(readYearlyCheck),
      },
    };
  });
}

function readMonthlyExpense(
  value: unknown,
): HomeReport["monthlyExpenses"][number] {
  const item = readObject(value);
  return {
    month: readMonth(item.month),
    fromDate: readDate(item.fromDate),
    toDate: readDate(item.toDate),
    inProgress: readBoolean(item.inProgress),
    actualAmount: readMoney(item.actualAmount),
    expenseCount: readCount(item.expenseCount),
    expenseFilter: readExpenseFilter(item.expenseFilter),
  };
}

function readCategoryExpense(
  value: unknown,
): HomeReport["categoryExpenses"][number] {
  const item = readObject(value);
  if (!Array.isArray(item.months)) throw invalid();
  let budget: HomeReport["categoryExpenses"][number]["budget"] = null;
  if (item.budget !== null) {
    const value = readObject(item.budget);
    if (!(value.period === "monthly" || value.period === "yearly"))
      throw invalid();
    budget = { period: value.period, amount: readMoney(value.amount) };
  }
  return {
    categoryId: readId(item.categoryId),
    name: readString(item.name),
    isActive: readBoolean(item.isActive),
    iconKey: readString(item.iconKey),
    colorKey: readNullableString(item.colorKey),
    actualAmount: readMoney(item.actualAmount),
    expenseCount: readCount(item.expenseCount),
    budget,
    months: item.months.map((entry) => {
      const month = readObject(entry);
      const status = month.budgetStatus;
      if (status !== null && !isBudgetStatus(status)) throw invalid();
      return {
        month: readMonth(month.month),
        actualAmount: readMoney(month.actualAmount),
        expenseCount: readCount(month.expenseCount),
        budgetStatus: status as HomeBudgetStatus | null,
        monthlyBudgetAmount:
          month.monthlyBudgetAmount === null
            ? null
            : readMoney(month.monthlyBudgetAmount),
        annualBudgetAmount:
          month.annualBudgetAmount === null
            ? null
            : readMoney(month.annualBudgetAmount),
        expenseFilter: readExpenseFilter(month.expenseFilter),
      };
    }),
  };
}

function readMonthlyCheck(
  value: unknown,
): HomeReport["budgetChecks"]["monthly"][number] {
  const item = readObject(value);
  return {
    categoryId: readId(item.categoryId),
    name: readString(item.name),
    budgetAmount: readMoney(item.budgetAmount),
    overBudgetMonths: readInteger(item.overBudgetMonths),
    eligibleMonths: readInteger(item.eligibleMonths),
    expenseFilter:
      item.expenseFilter === null
        ? null
        : readExpenseFilter(item.expenseFilter),
  };
}

function readYearlyCheck(
  value: unknown,
): HomeReport["budgetChecks"]["yearly"][number] {
  const item = readObject(value);
  if (!isBudgetStatus(item.status)) throw invalid();
  return {
    categoryId: readId(item.categoryId),
    name: readString(item.name),
    year: readYear(item.year),
    actualAmount: readMoney(item.actualAmount),
    limitAmount: readMoney(item.limitAmount),
    status: item.status,
    usageFromDate: readDate(item.usageFromDate),
    usageToDate: readDate(item.usageToDate),
    expenseFilter: readExpenseFilter(item.expenseFilter),
  };
}

function readHighestCategory(
  value: unknown,
): HomeReport["summary"]["highestCategory"] {
  const item = readObject(value);
  return {
    categoryId: readId(item.categoryId),
    name: readString(item.name),
    amount: readMoney(item.amount),
    expenseFilter: readExpenseFilter(item.expenseFilter),
  };
}

function readExpenseFilter(value: unknown): HomeExpenseFilter {
  const item = readObject(value);
  return {
    fromDate: readDate(item.fromDate),
    toDate: readDate(item.toDate),
    ...(item.categoryId === undefined
      ? {}
      : { categoryId: readId(item.categoryId) }),
  };
}

function readDateFilter(value: unknown): { fromDate: string; toDate: string } {
  const item = readObject(value);
  return { fromDate: readDate(item.fromDate), toDate: readDate(item.toDate) };
}

function readValue(value: unknown): HomeValue {
  const item = readObject(value);
  const exact = readObject(item.exact);
  return {
    exact: {
      numerator: readIntegerString(exact.numerator, true),
      denominator: readIntegerString(exact.denominator),
    },
    amount: readDecimal(item.amount),
  };
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  if (typeof value !== "string") throw invalid();
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid();
  return value;
}

function readId(value: unknown): string {
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) return value;
  throw invalid();
}

function readCount(value: unknown): string {
  if (typeof value === "string" && /^\d+$/u.test(value)) return value;
  throw invalid();
}

function readIntegerString(value: unknown, signed = false): string {
  const pattern = signed ? /^-?\d+$/u : /^\d+$/u;
  if (typeof value === "string" && pattern.test(value)) return value;
  throw invalid();
}

function readInteger(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return value;
  throw invalid();
}

function readMoney(value: unknown): string {
  if (typeof value === "string" && /^-?(?:0|[1-9]\d*)\.\d{2}$/u.test(value))
    return value;
  throw invalid();
}

function readDecimal(value: unknown): string {
  if (typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value))
    return value;
  throw invalid();
}

function readDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value))
    return value;
  throw invalid();
}

function readMonth(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/u.test(value))
    return value;
  throw invalid();
}

function readYear(value: unknown): string {
  if (typeof value === "string" && /^\d{4}$/u.test(value)) return value;
  throw invalid();
}

function readTimestamp(value: unknown): string {
  if (typeof value === "string" && Number.isFinite(Date.parse(value)))
    return value;
  throw invalid();
}

function readNullableString(value: unknown): string | null {
  if (value === null || typeof value === "string") return value;
  throw invalid();
}

function isBudgetStatus(value: unknown): value is HomeBudgetStatus {
  return (
    value === "normal" ||
    value === "nearing" ||
    value === "at_limit" ||
    value === "over"
  );
}

function invalid(): Error {
  return new Error("Invalid Home report response");
}
