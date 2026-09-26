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
  requireTransactionHistoryPage,
  type ApiGetClient,
  type CategorySummaryItem,
  type CategorySummaryResponse,
  type CategorySummaryTotals,
  type TransactionHistoryItem,
  type TransactionHistoryPage,
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
import {
  formatReportingPeriod,
  getReportingPeriodBounds,
  type ReportingPeriod,
} from "@/shared/reporting-period";
import {
  projectTransactionHistoryItem,
  type TransactionProjection,
} from "@/shared/transaction";

interface SpendingPoint {
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

type Transaction = TransactionProjection;

interface DashboardSummary {
  period: string;
  totalSpend: number;
  transactionCount: number;
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
  readonly status: "over" | "near" | "unbudgeted";
}

interface DashboardData {
  summary: DashboardSummary;
  spendingPoints: readonly SpendingPoint[];
  categorySpending: readonly CategorySpend[];
  recentTransactions: readonly Transaction[];
  budgetAlerts: readonly BudgetAlert[];
}

type DashboardApiClient = ApiGetClient;

interface DashboardResources {
  readonly categorySummary: CategorySummaryResponse;
  readonly categoryById: ReadonlyMap<string, CategoryProjection>;
  readonly transactions: readonly TransactionHistoryItem[];
  readonly recentTransactions: readonly TransactionHistoryItem[];
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

const FULL_TRANSACTION_PAGE_SIZE = 100;
const RECENT_TRANSACTION_PAGE_SIZE = 5;

async function loadAllTransactions(
  apiClient: DashboardApiClient,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
  spaceId?: string,
) {
  const transactions: TransactionHistoryItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const path = buildApiPath(buildTransactionCollectionPath(spaceId), {
      fromDate,
      toDate,
      pageSize: String(FULL_TRANSACTION_PAGE_SIZE),
      cursor: cursor ?? undefined,
    });
    const response = requireTransactionHistoryPage(
      requireApiResponse(
        await apiClient.get<TransactionHistoryPage>(path, { signal }),
        "Transaction history page",
        createDashboardDataError,
      ),
      createDashboardDataError,
    );

    transactions.push(...response.items);
    cursor = response.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) {
        throw new DashboardDataError(
          "The API returned a repeated Transaction history cursor.",
        );
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== null);

  return transactions;
}

async function loadRecentTransactions(
  apiClient: DashboardApiClient,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
  spaceId?: string,
) {
  const path = buildApiPath(buildTransactionCollectionPath(spaceId), {
    fromDate,
    toDate,
    pageSize: String(RECENT_TRANSACTION_PAGE_SIZE),
  });
  const response = requireTransactionHistoryPage(
    requireApiResponse(
      await apiClient.get<TransactionHistoryPage>(path, { signal }),
      "recent Transaction history page",
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
  const [transactions, recentTransactions] = await Promise.all([
    loadAllTransactions(apiClient, fromDate, toDate, signal, spaceId),
    loadRecentTransactions(apiClient, fromDate, toDate, signal, spaceId),
  ]);
  const statementImports = await loadStatementImports(
    apiClient,
    [...transactions, ...recentTransactions],
    signal,
    spaceId,
  );

  return {
    categorySummary,
    categoryById: projectCategoryCatalog(categoryCatalog),
    transactions,
    recentTransactions,
    statementImports,
    daysInPeriod,
  };
}

function createSpendingPoints(
  transactions: readonly TransactionHistoryItem[],
  daysInPeriod: number,
) {
  const dailyTotals = new Map<number, number>();

  transactions.forEach((transaction) => {
    const day = Number(transaction.purchaseDate.slice(-2));
    if (!Number.isInteger(day) || day < 1 || day > daysInPeriod) {
      throw new DashboardDataError(
        `Transaction ${transaction.id} has a purchase date outside the selected Reporting Period.`,
      );
    }

    const amountCents = Math.abs(
      moneyToCents(
        parseApiMoney(
          transaction.amount,
          `Transaction ${transaction.id}`,
          createDashboardDataError,
        ),
      ),
    );
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + amountCents);
  });

  return Array.from({ length: daysInPeriod }, (_, index) => ({
    label: String(index + 1),
    amount: centsToMoney(dailyTotals.get(index + 1) ?? 0),
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

function createRecentTransactions(
  transactions: readonly TransactionHistoryItem[],
  categoryById: ReadonlyMap<string, CategoryProjection>,
  statementImports: ReadonlyMap<string, StatementImportAccount>,
) {
  return transactions.map((transaction) =>
    projectTransactionHistoryItem(
      transaction,
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
    if (usage < 80) return null;
    return {
      categoryId: category.categoryId,
      label,
      spent,
      budget,
      remaining: centsToMoney(moneyToCents(budget) - moneyToCents(spent)),
      usage,
      status: usage >= 100 ? "over" : "near",
    };
  }).filter((alert): alert is BudgetAlert => alert !== null);
  const priority = { over: 0, near: 1, unbudgeted: 2 };
  return [
    ...alerts.filter((alert) => alert.status !== "unbudgeted"),
    ...alerts.filter((alert) => alert.status === "unbudgeted").sort((a, b) => b.spent - a.spent).slice(0, 3),
  ].sort((a, b) => priority[a.status] - priority[b.status] || b.spent - a.spent);
}

function createDashboardSummary(
  categorySummary: CategorySummaryResponse,
  categorySummaryTotals: CategorySummaryTotals,
  transactions: readonly TransactionHistoryItem[],
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
    transactionCount: categorySummaryTotals.transactionCount,
    recordedDayCount: new Set(
      transactions.map((transaction) => transaction.purchaseDate),
    ).size,
    accountCount: countDistinctAccounts(transactions, statementImports),
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
      resources.transactions,
      resources.statementImports,
      categorySpending,
      period,
      resources.daysInPeriod,
    ),
    spendingPoints: createSpendingPoints(
      resources.transactions,
      resources.daysInPeriod,
    ),
    categorySpending,
    recentTransactions: createRecentTransactions(
      resources.recentTransactions,
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

function buildTransactionCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/transactions"
    : `/spaces/${encodeURIComponent(spaceId)}/transactions`;
}

export { DashboardDataError, getDashboard };
export type {
  CategorySpend,
  BudgetAlert,
  DashboardApiClient,
  DashboardData,
  DashboardSummary,
  SpendingPoint,
  Transaction,
};
