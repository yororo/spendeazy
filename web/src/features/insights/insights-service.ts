import {
  buildApiPath,
  buildMonthlyCategorySummaryPath,
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

interface InsightsReport {
  readonly period: ReportingPeriod;
  readonly totalSpendingCents: number;
  readonly budgetedSpendingCents: number;
  readonly monthlyBudgetCents: number;
  readonly dailyBudgetPaceCents: number;
  readonly categories: readonly InsightsCategory[];
  readonly days: readonly InsightsDay[];
}

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

interface CategoryIdentity {
  readonly label: string;
  readonly color: CategoryColor;
}

async function getInsights(
  apiClient: InsightsApiClient,
  period: ReportingPeriod,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<InsightsReport> {
  const bounds = getReportingPeriodBounds(period);
  const [categoryResponse, summaryResponse, transactions] = await Promise.all([
    apiClient.get<readonly CategoryCatalogItem[]>(
      buildCategoryCollectionPath(spaceId),
      { signal },
    ),
    apiClient.get<CategorySummaryResponse>(
      buildMonthlyCategorySummaryPath(period, spaceId),
      { signal },
    ),
    loadAllTransactions(apiClient, bounds.fromDate, bounds.toDate, signal, spaceId),
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

  return createInsightsReport(period, bounds.daysInPeriod, catalog, summary, transactions);
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

function createInsightsReport(
  period: ReportingPeriod,
  daysInPeriod: number,
  catalog: readonly CategoryCatalogItem[],
  summary: CategorySummaryResponse,
  transactions: readonly TransactionHistoryItem[],
): InsightsReport {
  const categoryById = new Map<string, CategoryIdentity>(
    catalog.map((category) => [
      category.id,
      {
        label: category.name,
        color: resolveCategoryColor(category.id, category.color),
      },
    ]),
  );
  const budgetedCategoryIds = new Set<string>();
  let monthlyBudgetCents = 0;

  summary.categories.forEach((category) => {
    if (!categoryById.has(category.categoryId)) {
      categoryById.set(category.categoryId, {
        label: category.name,
        color: resolveCategoryColor(category.categoryId, undefined),
      });
    }

    if (category.budgetAmount === null) return;

    budgetedCategoryIds.add(category.categoryId);
    monthlyBudgetCents += moneyToCents(
      parseApiMoney(
        category.budgetAmount,
        `Budget ${category.categoryId}`,
        createInsightsDataError,
      ),
    );
  });

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
    const day = getDayOfMonth(transaction.purchaseDate, period, daysInPeriod);
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

    const categoryTotals = dailyCategoryTotals[day - 1]!;
    categoryTotals.set(
      categoryId,
      (categoryTotals.get(categoryId) ?? 0) + amountCents,
    );
    dailySpendingCents[day - 1]! += amountCents;

    if (categoryId !== null && budgetedCategoryIds.has(categoryId)) {
      dailyBudgetedSpendingCents[day - 1]! += amountCents;
    }
  });

  const spendingByCategory = new Map<string | null, number>();
  dailyCategoryTotals.forEach((categoryTotals) => {
    categoryTotals.forEach((amountCents, categoryId) => {
      spendingByCategory.set(
        categoryId,
        (spendingByCategory.get(categoryId) ?? 0) + amountCents,
      );
    });
  });

  const categories = [...spendingByCategory.entries()]
    .map(([id, spendingCents]): InsightsCategory => ({
      id,
      label: id === null ? "Uncategorized" : categoryById.get(id)!.label,
      color: id === null ? null : categoryById.get(id)!.color,
      spendingCents,
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label) || (left.id ?? "").localeCompare(right.id ?? ""),
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
    period,
    totalSpendingCents,
    budgetedSpendingCents,
    monthlyBudgetCents,
    dailyBudgetPaceCents: monthlyBudgetCents / daysInPeriod,
    categories,
    days,
  };
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

function buildTransactionCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/transactions"
    : `/spaces/${encodeURIComponent(spaceId)}/transactions`;
}

export { getInsights, InsightsDataError };
export type {
  InsightsApiClient,
  InsightsCategory,
  InsightsCategoryAmount,
  InsightsDay,
  InsightsReport,
};
