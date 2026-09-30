import {
  ApiError,
  buildApiPath,
  buildMonthlyCategorySummaryPath,
  isRecord,
  parseApiMoney,
  requireApiResponse,
  requireMonthlyCategorySummary,
  requireTransactionHistoryPage,
  type ApiClient,
  type CategorySummaryResponse,
  type TransactionHistoryItem,
  type TransactionHistoryPage,
} from "@/shared/api";
import {
  isCategoryCatalog,
  resolveCategoryColor,
  type CategoryCatalogItem,
  type CategoryColor,
} from "@/shared/category";
import { moneyToCents } from "@/shared/money";
import {
  getReportingPeriodBounds,
  type ReportingPeriod,
} from "@/shared/reporting-period";

interface InsightsCategory {
  readonly id: string | null;
  readonly label: string;
  readonly color: CategoryColor | null;
  readonly spendingCents: number;
  readonly monthlyBudgetCents: number | null;
}

interface InsightsBudgetedCategory {
  readonly categoryId: string;
  readonly label: string;
  readonly color: CategoryColor;
  readonly monthlyBudgetCents: number;
}

interface InsightsBudgetBreach extends InsightsBudgetedCategory {
  readonly breachCount: number;
}

interface InsightsLowSpendingCategory extends InsightsBudgetedCategory {
  readonly spendingCents: number;
}

interface InsightsCategoryAmount {
  readonly categoryId: string | null;
  readonly amountCents: number;
}

interface InsightsDay {
  readonly date: string;
  readonly day: number;
  readonly spendingCents: number;
  readonly budgetedSpendingCents: number;
  readonly categories: readonly InsightsCategoryAmount[];
}

interface InsightsDailyReport {
  readonly view: "daily";
  readonly period: ReportingPeriod;
  readonly totalSpendingCents: number;
  readonly budgetedSpendingCents: number;
  readonly monthlyBudgetCents: number;
  readonly dailyBudgetPaceCents: number;
  readonly frequentlyOverBudget: readonly InsightsBudgetBreach[];
  readonly lowestSpending: readonly InsightsLowSpendingCategory[];
  readonly monthlyBudgetedCategoryCount: number;
  readonly activeMonthlyBudgetedCategoryCount: number;
  readonly categories: readonly InsightsCategory[];
  readonly selectableCategories: readonly InsightsCategory[];
  readonly days: readonly InsightsDay[];
}

interface InsightsMonth {
  readonly period: ReportingPeriod;
  readonly totalSpendingCents: number;
  readonly budgetedSpendingCents: number;
  readonly isOverBudget: boolean;
  readonly categories: readonly InsightsCategoryAmount[];
}

interface InsightsMonthlyReport {
  readonly view: "monthly";
  readonly period: ReportingPeriod;
  readonly totalSpendingCents: number;
  readonly budgetedSpendingCents: number;
  readonly monthlyBudgetCents: number;
  readonly frequentlyOverBudget: readonly InsightsBudgetBreach[];
  readonly lowestSpending: readonly InsightsLowSpendingCategory[];
  readonly monthlyBudgetedCategoryCount: number;
  readonly activeMonthlyBudgetedCategoryCount: number;
  readonly categories: readonly InsightsCategory[];
  readonly selectableCategories: readonly InsightsCategory[];
  readonly months: readonly InsightsMonth[];
}

type InsightsReportResult = InsightsDailyReport | InsightsMonthlyReport;

type InsightsApiClient = Pick<ApiClient, "get">;

class InsightsDataError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "InsightsDataError";
  }
}

const createInsightsDataError = (message: string) =>
  new InsightsDataError(message);

const TRANSACTION_PAGE_SIZE = 100;
const MONTHLY_RANKING_LIMIT = 5;

interface CategoryIdentity {
  readonly label: string;
  readonly color: CategoryColor;
  readonly isActive: boolean;
  readonly monthlyBudgetCents: number | null;
}

interface CategoryBudgetResponse {
  readonly id: string;
  readonly categoryId: string;
  readonly amount: string;
  readonly period: "monthly" | "yearly";
  readonly updatedAt: string;
}

async function getDailyInsights(
  apiClient: InsightsApiClient,
  period: ReportingPeriod,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<InsightsDailyReport> {
  const bounds = getReportingPeriodBounds(period);
  const periods = getRollingPeriods(period);
  const firstPeriod = periods[0]!;
  const [categoryResponse, summaryResponse, transactions] = await Promise.all([
    apiClient.get<readonly CategoryCatalogItem[]>(
      buildCategoryCollectionPath(spaceId),
      { signal },
    ),
    apiClient.get<CategorySummaryResponse>(
      buildMonthlyCategorySummaryPath(period, spaceId),
      { signal },
    ),
    loadAllTransactions(
      apiClient,
      `${firstPeriod}-01`,
      bounds.toDate,
      signal,
      spaceId,
    ),
  ]);

  const catalog = requireCategoryCatalog(
    requireApiResponse(categoryResponse, "Category catalog", createInsightsDataError),
  );
  const summary = requireMonthlyCategorySummary(
    requireApiResponse(
      summaryResponse,
      "monthly Category Summary",
      createInsightsDataError,
    ),
    createInsightsDataError,
  );
  const inactiveCategoryBudgets = await loadInactiveCategoryBudgets(
    apiClient,
    catalog,
    summary,
    signal,
    spaceId,
  );

  return createDailyInsightsReport(
    period,
    periods,
    bounds.daysInPeriod,
    catalog,
    summary,
    inactiveCategoryBudgets,
    transactions,
  );
}

async function getMonthlyInsights(
  apiClient: InsightsApiClient,
  period: ReportingPeriod,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<InsightsMonthlyReport> {
  const periods = getRollingPeriods(period);
  const firstPeriod = periods[0]!;
  const { toDate } = getReportingPeriodBounds(period);
  const [categoryResponse, summaryResponse, transactions] = await Promise.all([
    apiClient.get<readonly CategoryCatalogItem[]>(
      buildCategoryCollectionPath(spaceId),
      { signal },
    ),
    apiClient.get<CategorySummaryResponse>(
      buildMonthlyCategorySummaryPath(period, spaceId),
      { signal },
    ),
    loadAllTransactions(
      apiClient,
      `${firstPeriod}-01`,
      toDate,
      signal,
      spaceId,
    ),
  ]);

  const catalog = requireCategoryCatalog(
    requireApiResponse(categoryResponse, "Category catalog", createInsightsDataError),
  );
  const summary = requireMonthlyCategorySummary(
    requireApiResponse(
      summaryResponse,
      "monthly Category Summary",
      createInsightsDataError,
    ),
    createInsightsDataError,
  );
  const inactiveCategoryBudgets = await loadInactiveCategoryBudgets(
    apiClient,
    catalog,
    summary,
    signal,
    spaceId,
  );

  return createMonthlyInsightsReport(
    period,
    periods,
    catalog,
    summary,
    inactiveCategoryBudgets,
    transactions,
  );
}

async function loadAllTransactions(
  apiClient: InsightsApiClient,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<readonly TransactionHistoryItem[]> {
  const transactions: TransactionHistoryItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const response = requireTransactionHistoryPage(
      requireApiResponse(
        await apiClient.get<TransactionHistoryPage>(
          buildApiPath(buildTransactionCollectionPath(spaceId), {
            fromDate,
            toDate,
            pageSize: String(TRANSACTION_PAGE_SIZE),
            cursor: cursor ?? undefined,
          }),
          { signal },
        ),
        "Transaction history page",
        createInsightsDataError,
      ),
      createInsightsDataError,
    );

    transactions.push(...response.items);
    cursor = response.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) {
        throw new InsightsDataError(
          "The API returned a repeated Transaction history cursor.",
        );
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== null);

  return transactions;
}

async function loadInactiveCategoryBudgets(
  apiClient: InsightsApiClient,
  catalog: readonly CategoryCatalogItem[],
  summary: CategorySummaryResponse,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<ReadonlyMap<string, number | null>> {
  // Monthly summaries omit inactive Categories without selected-month activity.
  const summarizedCategoryIds = new Set(
    summary.categories.map(({ categoryId }) => categoryId),
  );
  const categoriesWithoutSummary = catalog.filter(
    ({ id, isActive }) => !isActive && !summarizedCategoryIds.has(id),
  );
  const categoryBudgets = await Promise.all(
    categoriesWithoutSummary.map(async (category) => [
      category.id,
      await getInactiveCategoryBudget(apiClient, category, signal, spaceId),
    ] as const),
  );

  return new Map(categoryBudgets);
}

async function getInactiveCategoryBudget(
  apiClient: InsightsApiClient,
  category: CategoryCatalogItem,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<number | null> {
  try {
    const response = requireApiResponse(
      await apiClient.get<unknown>(
        buildCategoryBudgetPath(category.id, spaceId),
        { signal, expectedStatuses: [200] },
      ),
      "Category Budget",
      createInsightsDataError,
    );
    if (
      !isCategoryBudgetResponse(response) ||
      response.categoryId !== category.id
    ) {
      throw new InsightsDataError(
        `The API returned an invalid Budget for Category ${category.id}.`,
      );
    }
    if (response.period !== "monthly") return null;

    return moneyToCents(
      parseApiMoney(
        response.amount,
        `Budget ${category.id}`,
        createInsightsDataError,
      ),
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      error.code === "BUDGET_NOT_FOUND"
    ) {
      return null;
    }

    throw error;
  }
}

function isCategoryBudgetResponse(
  value: unknown,
): value is CategoryBudgetResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^[1-9]\d*$/u.test(value.id) &&
    typeof value.categoryId === "string" &&
    /^[1-9]\d*$/u.test(value.categoryId) &&
    typeof value.amount === "string" &&
    /^(?=.*[1-9])\d{1,13}\.\d{2}$/u.test(value.amount) &&
    (value.period === "monthly" || value.period === "yearly") &&
    typeof value.updatedAt === "string"
  );
}

function createDailyInsightsReport(
  period: ReportingPeriod,
  periods: readonly ReportingPeriod[],
  daysInPeriod: number,
  catalog: readonly CategoryCatalogItem[],
  summary: CategorySummaryResponse,
  inactiveCategoryBudgets: ReadonlyMap<string, number | null>,
  transactions: readonly TransactionHistoryItem[],
): InsightsDailyReport {
  const { categoryById, budgetedCategoryIds, monthlyBudgetCents } =
    createCategoryContext(catalog, summary, inactiveCategoryBudgets);
  const amountsByMonth = periods.map(() => new Map<string | null, number>());
  const totalByMonth = periods.map(() => 0);
  const budgetedByMonth = periods.map(() => 0);
  const indexByPeriod = new Map(periods.map((month, index) => [month, index]));
  const selectedMonthIndex = indexByPeriod.get(period)!;
  const dailyCategoryTotals = Array.from(
    { length: daysInPeriod },
    () => new Map<string | null, number>(),
  );
  const dailySpendingCents = Array.from({ length: daysInPeriod }, () => 0);
  const dailyBudgetedSpendingCents = Array.from(
    { length: daysInPeriod },
    () => 0,
  );

  transactions.forEach((transaction) => {
    const transactionPeriod = getTransactionPeriod(transaction.purchaseDate);
    const monthIndex = indexByPeriod.get(transactionPeriod);
    if (monthIndex === undefined) {
      throw new InsightsDataError(
        "The API returned a Transaction outside the selected 12-month Reporting Period.",
      );
    }
    const amountCents = moneyToCents(
      parseApiMoney(
        transaction.amount,
        `Transaction ${transaction.id} amount`,
        createInsightsDataError,
      ),
    );
    const categoryId = transaction.categoryId;

    if (categoryId !== null && !categoryById.has(categoryId)) {
      throw new InsightsDataError(
        `Transaction ${transaction.id} references missing Category ${categoryId}.`,
      );
    }

    const categoryTotals = amountsByMonth[monthIndex]!;
    categoryTotals.set(
      categoryId,
      (categoryTotals.get(categoryId) ?? 0) + amountCents,
    );
    totalByMonth[monthIndex]! += amountCents;

    if (categoryId !== null && budgetedCategoryIds.has(categoryId)) {
      budgetedByMonth[monthIndex]! += amountCents;
    }

    if (monthIndex === selectedMonthIndex) {
      const day = getDayOfMonth(
        transaction.purchaseDate,
        period,
        daysInPeriod,
      );
      const dayCategoryTotals = dailyCategoryTotals[day - 1]!;
      dayCategoryTotals.set(
        categoryId,
        (dayCategoryTotals.get(categoryId) ?? 0) + amountCents,
      );
      dailySpendingCents[day - 1]! += amountCents;

      if (categoryId !== null && budgetedCategoryIds.has(categoryId)) {
        dailyBudgetedSpendingCents[day - 1]! += amountCents;
      }
    }
  });

  const spendingByCategory = amountsByMonth[selectedMonthIndex]!;

  const categories = createCategoryReports(spendingByCategory, categoryById);
  const selectableCategories = createSelectableCategoryReports(
    spendingByCategory,
    categoryById,
  );
  const { frequentlyOverBudget, lowestSpending } = createMonthlyRankings(
    amountsByMonth,
    selectedMonthIndex,
    categoryById,
  );

  const days = dailyCategoryTotals.map((categoryTotals, index): InsightsDay => ({
    date: `${period}-${String(index + 1).padStart(2, "0")}`,
    day: index + 1,
    spendingCents: dailySpendingCents[index]!,
    budgetedSpendingCents: dailyBudgetedSpendingCents[index]!,
    categories: [...categoryTotals.entries()].map(([categoryId, amountCents]) => ({
      categoryId,
      amountCents,
    })),
  }));
  const totalSpendingCents = dailySpendingCents.reduce(
    (total, amount) => total + amount,
    0,
  );
  const budgetedSpendingCents = dailyBudgetedSpendingCents.reduce(
    (total, amount) => total + amount,
    0,
  );

  return {
    view: "daily",
    period,
    totalSpendingCents,
    budgetedSpendingCents,
    monthlyBudgetCents,
    dailyBudgetPaceCents: monthlyBudgetCents / daysInPeriod,
    frequentlyOverBudget,
    lowestSpending,
    monthlyBudgetedCategoryCount: budgetedCategoryIds.size,
    activeMonthlyBudgetedCategoryCount: [...budgetedCategoryIds].filter(
      (categoryId) => categoryById.get(categoryId)?.isActive === true,
    ).length,
    categories,
    selectableCategories,
    days,
  };
}

function createMonthlyInsightsReport(
  period: ReportingPeriod,
  periods: readonly ReportingPeriod[],
  catalog: readonly CategoryCatalogItem[],
  summary: CategorySummaryResponse,
  inactiveCategoryBudgets: ReadonlyMap<string, number | null>,
  transactions: readonly TransactionHistoryItem[],
): InsightsMonthlyReport {
  const { categoryById, budgetedCategoryIds, monthlyBudgetCents } =
    createCategoryContext(catalog, summary, inactiveCategoryBudgets);
  const amountsByMonth = periods.map(() => new Map<string | null, number>());
  const totalByMonth = periods.map(() => 0);
  const budgetedByMonth = periods.map(() => 0);
  const indexByPeriod = new Map(periods.map((month, index) => [month, index]));
  const selectedMonthIndex = indexByPeriod.get(period)!;

  transactions.forEach((transaction) => {
    const transactionPeriod = getTransactionPeriod(transaction.purchaseDate);
    const monthIndex = indexByPeriod.get(transactionPeriod);
    if (monthIndex === undefined) {
      throw new InsightsDataError(
        "The API returned a Transaction outside the selected 12-month Reporting Period.",
      );
    }

    const amountCents = moneyToCents(
      parseApiMoney(
        transaction.amount,
        `Transaction ${transaction.id} amount`,
        createInsightsDataError,
      ),
    );
    const categoryId = transaction.categoryId;

    if (categoryId !== null && !categoryById.has(categoryId)) {
      throw new InsightsDataError(
        `Transaction ${transaction.id} references missing Category ${categoryId}.`,
      );
    }

    const monthAmounts = amountsByMonth[monthIndex]!;
    monthAmounts.set(
      categoryId,
      (monthAmounts.get(categoryId) ?? 0) + amountCents,
    );
    totalByMonth[monthIndex]! += amountCents;

    if (categoryId !== null && budgetedCategoryIds.has(categoryId)) {
      budgetedByMonth[monthIndex]! += amountCents;
    }
  });

  const spendingByCategory = new Map<string | null, number>();
  amountsByMonth.forEach((monthAmounts) => {
    monthAmounts.forEach((amountCents, categoryId) => {
      spendingByCategory.set(
        categoryId,
        (spendingByCategory.get(categoryId) ?? 0) + amountCents,
      );
    });
  });

  const months = periods.map((monthPeriod, index): InsightsMonth => ({
    period: monthPeriod,
    totalSpendingCents: totalByMonth[index]!,
    budgetedSpendingCents: budgetedByMonth[index]!,
    isOverBudget: budgetedByMonth[index]! > monthlyBudgetCents,
    categories: [...amountsByMonth[index]!.entries()].map(
      ([categoryId, amountCents]) => ({ categoryId, amountCents }),
    ),
  }));
  const { frequentlyOverBudget, lowestSpending } = createMonthlyRankings(
    amountsByMonth,
    selectedMonthIndex,
    categoryById,
  );

  return {
    view: "monthly",
    period,
    totalSpendingCents: totalByMonth.reduce((total, cents) => total + cents, 0),
    budgetedSpendingCents: budgetedByMonth.reduce(
      (total, cents) => total + cents,
      0,
    ),
    monthlyBudgetCents,
    frequentlyOverBudget,
    lowestSpending,
    monthlyBudgetedCategoryCount: budgetedCategoryIds.size,
    activeMonthlyBudgetedCategoryCount: [...budgetedCategoryIds].filter(
      (categoryId) => categoryById.get(categoryId)?.isActive === true,
    ).length,
    categories: createCategoryReports(spendingByCategory, categoryById),
    selectableCategories: createSelectableCategoryReports(
      spendingByCategory,
      categoryById,
    ),
    months,
  };
}

function createCategoryContext(
  catalog: readonly CategoryCatalogItem[],
  summary: CategorySummaryResponse,
  inactiveCategoryBudgets: ReadonlyMap<string, number | null>,
) {
  const categoryById = new Map<string, CategoryIdentity>(
    catalog.map((category) => [
      category.id,
      {
        label: category.name,
        color: resolveCategoryColor(category.id, category.color),
        isActive: category.isActive,
        monthlyBudgetCents: inactiveCategoryBudgets.get(category.id) ?? null,
      },
    ]),
  );
  const budgetedCategoryIds = new Set<string>();

  summary.categories.forEach((category) => {
    if (!categoryById.has(category.categoryId)) {
      categoryById.set(category.categoryId, {
        label: category.name,
        color: resolveCategoryColor(category.categoryId, undefined),
        isActive: category.isActive,
        monthlyBudgetCents: null,
      });
    }

    const identity = categoryById.get(category.categoryId)!;
    const categoryBudgetCents = category.budgetAmount === null
      ? identity.monthlyBudgetCents
      : moneyToCents(
          parseApiMoney(
            category.budgetAmount,
            `Budget ${category.categoryId}`,
            createInsightsDataError,
          ),
        );
    categoryById.set(category.categoryId, {
      ...identity,
      monthlyBudgetCents: categoryBudgetCents,
    });
  });

  let monthlyBudgetCents = 0;
  categoryById.forEach((category, categoryId) => {
    if (category.monthlyBudgetCents === null) return;

    budgetedCategoryIds.add(categoryId);
    monthlyBudgetCents += category.monthlyBudgetCents;
  });

  return { categoryById, budgetedCategoryIds, monthlyBudgetCents };
}

function createCategoryReports(
  spendingByCategory: ReadonlyMap<string | null, number>,
  categoryById: ReadonlyMap<string, CategoryIdentity>,
): InsightsCategory[] {
  return [...spendingByCategory.entries()]
    .map(([id, spendingCents]): InsightsCategory => ({
      id,
      label: id === null ? "Uncategorized" : categoryById.get(id)!.label,
      color: id === null ? null : categoryById.get(id)!.color,
      spendingCents,
      monthlyBudgetCents: id === null
        ? null
        : categoryById.get(id)!.monthlyBudgetCents,
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label) ||
      (left.id ?? "").localeCompare(right.id ?? ""),
    );
}

function createSelectableCategoryReports(
  spendingByCategory: ReadonlyMap<string | null, number>,
  categoryById: ReadonlyMap<string, CategoryIdentity>,
): InsightsCategory[] {
  const spendingByKnownCategory = new Map(spendingByCategory);

  categoryById.forEach((_, categoryId) => {
    if (!spendingByKnownCategory.has(categoryId)) {
      spendingByKnownCategory.set(categoryId, 0);
    }
  });

  return createCategoryReports(spendingByKnownCategory, categoryById).filter(
    ({ id }) => id !== null,
  );
}

function createMonthlyRankings(
  amountsByMonth: readonly ReadonlyMap<string | null, number>[],
  selectedMonthIndex: number,
  categoryById: ReadonlyMap<string, CategoryIdentity>,
): {
  readonly frequentlyOverBudget: readonly InsightsBudgetBreach[];
  readonly lowestSpending: readonly InsightsLowSpendingCategory[];
} {
  const frequentlyOverBudget = [...categoryById.entries()]
    .flatMap(([categoryId, category]) => {
      const budgetCents = category.monthlyBudgetCents;
      if (budgetCents === null) return [];

      const breachCount = amountsByMonth.reduce(
        (count, monthAmounts) =>
          count + ((monthAmounts.get(categoryId) ?? 0) > budgetCents ? 1 : 0),
        0,
      );
      if (breachCount === 0) return [];

      return [{
        categoryId,
        label: category.label,
        color: category.color,
        monthlyBudgetCents: budgetCents,
        breachCount,
      }];
    })
    .sort((left, right) =>
      right.breachCount - left.breachCount ||
      compareCategoryNameAndId(left, right),
    )
    .slice(0, MONTHLY_RANKING_LIMIT);

  const lowestSpending = [...categoryById.entries()]
    .flatMap(([categoryId, category]) => {
      const budgetCents = category.monthlyBudgetCents;
      if (!category.isActive || budgetCents === null) return [];

      return [{
        categoryId,
        label: category.label,
        color: category.color,
        spendingCents:
          amountsByMonth[selectedMonthIndex]!.get(categoryId) ?? 0,
        monthlyBudgetCents: budgetCents,
      }];
    })
    .sort((left, right) =>
      left.spendingCents - right.spendingCents ||
      compareCategoryNameAndId(left, right),
    )
    .slice(0, MONTHLY_RANKING_LIMIT);

  return { frequentlyOverBudget, lowestSpending };
}

function compareCategoryNameAndId(
  left: Pick<InsightsBudgetedCategory, "label" | "categoryId">,
  right: Pick<InsightsBudgetedCategory, "label" | "categoryId">,
): number {
  return (
    left.label.localeCompare(right.label) ||
    left.categoryId.localeCompare(right.categoryId)
  );
}

function getRollingPeriods(period: ReportingPeriod): ReportingPeriod[] {
  const [year, month] = period.split("-").map(Number);

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - 1 - 11 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` as ReportingPeriod;
  });
}

function getTransactionPeriod(purchaseDate: string): ReportingPeriod {
  const dateMatch = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/u.exec(purchaseDate);
  if (!dateMatch) {
    throw new InsightsDataError(
      "The API returned an invalid Transaction purchase date.",
    );
  }

  const period = `${dateMatch[1]}-${dateMatch[2]}` as ReportingPeriod;
  const day = Number(dateMatch[3]);
  if (day < 1 || day > getReportingPeriodBounds(period).daysInPeriod) {
    throw new InsightsDataError(
      "The API returned an invalid Transaction purchase date.",
    );
  }

  return period;
}

function getDayOfMonth(
  purchaseDate: string,
  period: ReportingPeriod,
  daysInPeriod: number,
): number {
  const dateMatch = /^(\d{4}-\d{2})-(\d{2})$/u.exec(purchaseDate);
  if (!dateMatch || dateMatch[1] !== period) {
    throw new InsightsDataError(
      "The API returned a Transaction outside the selected Reporting Period.",
    );
  }

  const day = Number(dateMatch[2]);
  if (!Number.isInteger(day) || day < 1 || day > daysInPeriod) {
    throw new InsightsDataError(
      "The API returned an invalid Transaction purchase date.",
    );
  }

  return day;
}

function requireCategoryCatalog(response: unknown): readonly CategoryCatalogItem[] {
  if (!isCategoryCatalog(response)) {
    throw new InsightsDataError("The API returned an invalid Category catalog.");
  }

  return response;
}

function buildCategoryCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/categories"
    : `/spaces/${encodeURIComponent(spaceId)}/categories`;
}

function buildCategoryBudgetPath(categoryId: string, spaceId?: string): string {
  return `${buildCategoryCollectionPath(spaceId)}/${encodeURIComponent(
    categoryId,
  )}/budget`;
}

function buildTransactionCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/transactions"
    : `/spaces/${encodeURIComponent(spaceId)}/transactions`;
}

export { getDailyInsights, getMonthlyInsights, InsightsDataError };
export type {
  InsightsApiClient,
  InsightsBudgetBreach,
  InsightsCategory,
  InsightsCategoryAmount,
  InsightsDay,
  InsightsLowSpendingCategory,
  InsightsMonth,
  InsightsDailyReport,
  InsightsReportResult,
  InsightsMonthlyReport,
};
