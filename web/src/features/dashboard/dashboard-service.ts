import {
  countDistinctAccounts,
  loadStatementImports,
  type StatementImportAccount,
} from "@/shared/account";
import {
  buildApiPath,
  buildMonthlyCategorySummaryPath,
  getCategorySummaryTotals,
  parseApiMoney,
  requireApiResponse,
  requireMonthlyCategorySummary,
  requireExpenseHistoryPage,
  type ApiGetClient,
  type CategorySummaryItem,
  type CategorySummaryResponse,
  type CategorySummaryTotals,
  type ExpenseHistoryItem,
  type ExpenseHistoryPage,
} from "@/shared/api";
import {
  isCategoryCatalog,
  projectCategoryCatalog,
  type CategoryCatalogItem,
  type CategoryColor,
  type CategoryKey,
  type CategoryProjection,
} from "@/shared/category";
import { centsToMoney, moneyToCents, roundMoney } from "@/shared/money";
import { getBudgetStatus } from "@/shared/budget";
import {
  formatReportingPeriod,
  getReportingPeriodBounds,
  type ReportingPeriod,
} from "@/shared/reporting-period";
import {
  projectExpenseHistoryItem,
  type ExpenseProjection,
} from "@/shared/expense";

interface SpendingPoint {
  categories: readonly { id: string | null; label: string; color: CategoryColor | null; amount: number }[];
  label: string;
  amount: number;
}

interface CategorySpend {
  id: string;
  category: CategoryKey;
  label: string;
  color: CategoryColor;
  amount: number;
  share: number;
}

type Expense = ExpenseProjection;

interface DashboardSummary {
  period: string;
  totalSpend: number;
  expenseCount: number;
  recordedDayCount: number;
  accountCount: number;
  topCategory: string;
  topCategoryAmount: number;
  averagePerDay: number;
  budgetUsed: number;
  budgetRemaining: number;
  budgetLimit: number;
  budgetedSpend: number;
  unbudgetedSpend: number;
}

interface BudgetAlert {
  readonly categoryId: string;
  readonly label: string;
  readonly spent: number;
  readonly budget: number | null;
  readonly remaining: number | null;
  readonly usage: number | null;
  readonly status: "over" | "limit" | "near" | "unbudgeted";
}

interface DashboardData {
  summary: DashboardSummary;
  spendingPoints: readonly SpendingPoint[];
  categorySpending: readonly CategorySpend[];
  recentExpenses: readonly Expense[];
  budgetAlerts: readonly BudgetAlert[];
}

type DashboardApiClient = ApiGetClient;

interface DashboardResources {
  readonly categorySummary: CategorySummaryResponse;
  readonly categoryById: ReadonlyMap<string, CategoryProjection>;
  readonly expenses: readonly ExpenseHistoryItem[];
  readonly recentExpenses: readonly ExpenseHistoryItem[];
  readonly statementImports: ReadonlyMap<string, StatementImportAccount>;
  readonly daysInPeriod: number;
}

class DashboardDataError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "DashboardDataError";
  }
}

const createDashboardDataError = (message: string) =>
  new DashboardDataError(message);

function requireCategoryCatalog(response: unknown): readonly CategoryCatalogItem[] {
  if (!isCategoryCatalog(response)) {
    throw createDashboardDataError(
      "The API returned an invalid Category catalog.",
    );
  }

  return response;
}

const FULL_EXPENSE_PAGE_SIZE = 100;
const RECENT_EXPENSE_PAGE_SIZE = 5;

async function loadAllExpenses(
  apiClient: DashboardApiClient,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
  spaceId?: string,
) {
  const expenses: ExpenseHistoryItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const path = buildApiPath(buildExpenseCollectionPath(spaceId), {
      fromDate,
      toDate,
      pageSize: String(FULL_EXPENSE_PAGE_SIZE),
      cursor: cursor ?? undefined,
    });
    const response = requireExpenseHistoryPage(
      requireApiResponse(
        await apiClient.get<ExpenseHistoryPage>(path, { signal }),
        "Expense history page",
        createDashboardDataError,
      ),
      createDashboardDataError,
    );

    expenses.push(...response.items);
    cursor = response.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) {
        throw new DashboardDataError(
          "The API returned a repeated Expense history cursor.",
        );
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== null);

  return expenses;
}

async function loadRecentExpenses(
  apiClient: DashboardApiClient,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
  spaceId?: string,
) {
  const path = buildApiPath(buildExpenseCollectionPath(spaceId), {
    fromDate,
    toDate,
    pageSize: String(RECENT_EXPENSE_PAGE_SIZE),
  });
  const response = requireExpenseHistoryPage(
    requireApiResponse(
      await apiClient.get<ExpenseHistoryPage>(path, { signal }),
      "recent Expense history page",
      createDashboardDataError,
    ),
    createDashboardDataError,
  );

  return response.items;
}

async function loadDashboardResources(
  apiClient: DashboardApiClient,
  period: ReportingPeriod,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<DashboardResources> {
  const { fromDate, toDate, daysInPeriod } = getReportingPeriodBounds(period);
  const summaryPath = buildMonthlyCategorySummaryPath(period, spaceId);
  const [categoryCatalogResponse, categorySummaryResponse] =
    await Promise.all([
      apiClient.get<unknown>(buildCategoryCollectionPath(spaceId), { signal }),
      apiClient.get<CategorySummaryResponse>(summaryPath, { signal }),
    ]);
  const categoryCatalog = requireCategoryCatalog(
    requireApiResponse(
      categoryCatalogResponse,
      "Category catalog",
      createDashboardDataError,
    ),
  );
  const categorySummary = requireMonthlyCategorySummary(
    requireApiResponse(
      categorySummaryResponse,
      "monthly Category Summary",
      createDashboardDataError,
    ),
    createDashboardDataError,
  );
  const [expenses, recentExpenses] = await Promise.all([
    loadAllExpenses(apiClient, fromDate, toDate, signal, spaceId),
    loadRecentExpenses(apiClient, fromDate, toDate, signal, spaceId),
  ]);
  const statementImports = await loadStatementImports(
    apiClient,
    [...expenses, ...recentExpenses],
    signal,
    spaceId,
  );

  return {
    categorySummary,
    categoryById: projectCategoryCatalog(categoryCatalog),
    expenses,
    recentExpenses,
    statementImports,
    daysInPeriod,
  };
}

function createSpendingPoints(
  expenses: readonly ExpenseHistoryItem[],
  daysInPeriod: number,
  categoryById: ReadonlyMap<string, CategoryProjection>,
) {
  const dailyCategories = new Map<number, Map<string | null, number>>();
  const dailyTotals = new Map<number, number>();

  expenses.forEach((expense) => {
    const day = Number(expense.purchaseDate.slice(-2));
    if (!Number.isInteger(day) || day < 1 || day > daysInPeriod) {
      throw new DashboardDataError(
        `Expense ${expense.id} has a purchase date outside the selected Reporting Period.`,
      );
    }

    const amountCents = Math.abs(
      moneyToCents(
        parseApiMoney(
          expense.amount,
          `Expense ${expense.id}`,
          createDashboardDataError,
        ),
      ),
    );
    const categories = dailyCategories.get(day) ?? new Map<string | null, number>();
    const categoryId = expense.categoryId ?? null;
    if (categoryId !== null && !categoryById.has(categoryId)) {
      throw new DashboardDataError(`Category ${categoryId} is missing from the Category catalog.`);
    }
    categories.set(categoryId, (categories.get(categoryId) ?? 0) + amountCents);
    dailyCategories.set(day, categories);
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + amountCents);
  });

  return Array.from({ length: daysInPeriod }, (_, index) => ({
    label: String(index + 1),
    amount: centsToMoney(dailyTotals.get(index + 1) ?? 0),
    categories: [...(dailyCategories.get(index + 1) ?? [])].map(([id, amount]) => ({
      id, label: id === null ? "Uncategorized" : categoryById.get(id)!.label,
      color: id === null ? null : categoryById.get(id)!.color, amount: centsToMoney(amount),
    })).sort((a, b) => (a.id ?? "").localeCompare(b.id ?? "")),
  }));
}

function createCategorySpending(
  categories: readonly CategorySummaryItem[],
  categoryById: ReadonlyMap<string, CategoryProjection>,
  totalSpend: number,
) {
  return categories
    .map((category) => {
      const projection = categoryById.get(category.categoryId);
      if (!projection || projection.color === null) {
        throw new DashboardDataError(
          `Category ${category.categoryId} is missing from the Category catalog.`,
        );
      }

      return {
        id: category.categoryId,
        category: projection.key,
        label: projection.label,
        color: projection.color,
        amount: roundMoney(
          parseApiMoney(
            category.totalAmount,
            `Category ${category.categoryId}`,
            createDashboardDataError,
          ),
        ),
      };
    })
    .filter((category) => category.amount !== 0)
    .map((category) => ({
      ...category,
      share:
        totalSpend > 0
          ? Math.round((category.amount / totalSpend) * 1_000) / 10
          : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
}

function createRecentExpenses(
  expenses: readonly ExpenseHistoryItem[],
  categoryById: ReadonlyMap<string, CategoryProjection>,
  statementImports: ReadonlyMap<string, StatementImportAccount>,
) {
  return expenses.map((expense) =>
    projectExpenseHistoryItem(
      expense,
      categoryById,
      statementImports,
      createDashboardDataError,
    ),
  );
}

function createBudgetProjection(categories: readonly CategorySummaryItem[]) {
  const budgetCategories = categories.filter(
    (category) => category.budgetAmount !== null,
  );
  const totalBudgetCents = budgetCategories.reduce(
    (total, category) =>
      total +
      moneyToCents(
        parseApiMoney(
          category.budgetAmount!,
          `Budget ${category.categoryId}`,
          createDashboardDataError,
        ),
      ),
    0,
  );
  const budgetRemainingCents = budgetCategories.reduce((total, category) => {
    const budget = parseApiMoney(
      category.budgetAmount!,
      `Budget ${category.categoryId}`,
      createDashboardDataError,
    );
    const spending = parseApiMoney(
      category.totalAmount,
      `Category ${category.categoryId}`,
      createDashboardDataError,
    );
    const remaining =
      category.remainingAmount === null
        ? budget - spending
        : parseApiMoney(
            category.remainingAmount,
            `Budget ${category.categoryId} remainingAmount`,
            createDashboardDataError,
          );
    return total + moneyToCents(remaining);
  }, 0);
  const budgetedSpendCents = budgetCategories.reduce(
    (total, category) =>
      total + moneyToCents(parseApiMoney(category.totalAmount, `Category ${category.categoryId}`, createDashboardDataError)),
    0,
  );

  return {
    budgetUsed:
      totalBudgetCents > 0
        ? Math.round(
            ((totalBudgetCents - budgetRemainingCents) / totalBudgetCents) *
              1_000,
          ) / 10
        : 0,
    budgetRemaining: centsToMoney(budgetRemainingCents),
    budgetLimit: centsToMoney(totalBudgetCents),
    budgetedSpend: centsToMoney(budgetedSpendCents),
  };
}

function createBudgetAlerts(
  categories: readonly CategorySummaryItem[],
  categoryById: ReadonlyMap<string, CategoryProjection>,
): BudgetAlert[] {
  const alerts = categories.map((category): BudgetAlert | null => {
    const spent = parseApiMoney(category.totalAmount, `Category ${category.categoryId}`, createDashboardDataError);
    if (spent <= 0) return null;
    const label = categoryById.get(category.categoryId)?.label ?? category.name;
    if (category.budgetAmount === null) {
      return { categoryId: category.categoryId, label, spent, budget: null, remaining: null, usage: null, status: "unbudgeted" };
    }
    const budget = parseApiMoney(category.budgetAmount, `Budget ${category.categoryId}`, createDashboardDataError);
    const usage = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    const status = getBudgetStatus(moneyToCents(spent), moneyToCents(budget));
    if (status === "within") return null;
    return {
      categoryId: category.categoryId,
      label,
      spent,
      budget,
      remaining: centsToMoney(moneyToCents(budget) - moneyToCents(spent)),
      usage,
      status,
    };
  }).filter((alert): alert is BudgetAlert => alert !== null);
  const priority = { over: 0, limit: 1, near: 2, unbudgeted: 3 };
  return [
    ...alerts.filter((alert) => alert.status !== "unbudgeted"),
    ...alerts.filter((alert) => alert.status === "unbudgeted").sort((a, b) => b.spent - a.spent).slice(0, 3),
  ].sort((a, b) => priority[a.status] - priority[b.status] || b.spent - a.spent);
}

function createDashboardSummary(
  categorySummary: CategorySummaryResponse,
  categorySummaryTotals: CategorySummaryTotals,
  expenses: readonly ExpenseHistoryItem[],
  statementImports: ReadonlyMap<string, StatementImportAccount>,
  categorySpending: readonly CategorySpend[],
  period: ReportingPeriod,
  daysInPeriod: number,
): DashboardSummary {
  const budget = createBudgetProjection(categorySummary.categories);
  const topCategory = categorySpending[0];

  return {
    period: formatReportingPeriod(period),
    totalSpend: categorySummaryTotals.totalAmount,
    expenseCount: categorySummaryTotals.expenseCount,
    recordedDayCount: new Set(
      expenses.map((expense) => expense.purchaseDate),
    ).size,
    accountCount: countDistinctAccounts(expenses, statementImports),
    topCategory: topCategory?.label ?? "None",
    topCategoryAmount: topCategory?.amount ?? 0,
    averagePerDay: roundMoney(categorySummaryTotals.totalAmount / daysInPeriod),
    budgetUsed: budget.budgetUsed,
    budgetRemaining: budget.budgetRemaining,
    budgetLimit: budget.budgetLimit,
    budgetedSpend: budget.budgetedSpend,
    unbudgetedSpend: centsToMoney(
      moneyToCents(categorySummaryTotals.totalAmount) - moneyToCents(budget.budgetedSpend),
    ),
  };
}

async function getDashboard(
  apiClient: DashboardApiClient,
  period: ReportingPeriod,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<DashboardData> {
  const resources = await loadDashboardResources(
    apiClient,
    period,
    signal,
    spaceId,
  );
  const categoryById = resources.categoryById;
  const categorySummaryTotals = getCategorySummaryTotals(
    resources.categorySummary,
    createDashboardDataError,
  );
  const categorySpending = createCategorySpending(
    resources.categorySummary.categories,
    categoryById,
    categorySummaryTotals.totalAmount,
  );

  return {
    summary: createDashboardSummary(
      resources.categorySummary,
      categorySummaryTotals,
      resources.expenses,
      resources.statementImports,
      categorySpending,
      period,
      resources.daysInPeriod,
    ),
    spendingPoints: createSpendingPoints(
      resources.expenses,
      resources.daysInPeriod,
      categoryById,
    ),
    categorySpending,
    recentExpenses: createRecentExpenses(
      resources.recentExpenses,
      categoryById,
      resources.statementImports,
    ),
    budgetAlerts: createBudgetAlerts(resources.categorySummary.categories, categoryById),
  };
}

function buildCategoryCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/categories"
    : `/spaces/${encodeURIComponent(spaceId)}/categories`;
}

function buildExpenseCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/expenses"
    : `/spaces/${encodeURIComponent(spaceId)}/expenses`;
}

export { DashboardDataError, getDashboard };
export type {
  CategorySpend,
  BudgetAlert,
  DashboardApiClient,
  DashboardData,
  DashboardSummary,
  SpendingPoint,
  Expense,
};
