import { loadStatementImports } from "@/shared/account";
import {
  buildApiPath,
  buildMonthlyCategorySummaryPath,
  getCategorySummaryTotals,
  requireApiResponse,
  requireMonthlyCategorySummary,
  requireTransactionHistoryPage,
  type ApiGetClient,
  type CategorySummaryResponse,
  type TransactionHistoryPage,
} from "@/shared/api";
import {
  isCategoryCatalog,
  projectCategoryCatalog,
  type CategoryCatalogItem,
  type CategoryColor,
  type CategoryKey,
} from "@/shared/category";
import {
  formatReportingPeriod,
  getReportingPeriodBounds,
  type ReportingPeriod,
} from "@/shared/reporting-period";
import { projectTransactionHistoryItem } from "@/shared/transaction";

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: CategoryKey;
  categoryLabel: string;
  categoryColor: CategoryColor | null;
  account: string;
  amount: number;
}

interface TransactionSummary {
  period: string;
  transactionCount: number;
  totalExpense: number;
}

interface ListTransactionsParams {
  period: ReportingPeriod;
  pageSize: number;
  cursor?: string | null;
}

interface TransactionPage {
  items: readonly Transaction[];
  nextCursor: string | null;
  summary: TransactionSummary;
}

type TransactionsApiClient = ApiGetClient;

class TransactionsDataError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "TransactionsDataError";
  }
}

const createTransactionsDataError = (message: string) =>
  new TransactionsDataError(message);

function requireCategoryCatalog(
  response: unknown,
): readonly CategoryCatalogItem[] {
  if (!isCategoryCatalog(response)) {
    throw createTransactionsDataError(
      "The API returned an invalid Category catalog.",
    );
  }

  return response;
}

const MAX_PAGE_SIZE = 100;

function createTransactionSummary(
  categorySummary: CategorySummaryResponse,
  period: ReportingPeriod,
): TransactionSummary {
  const summaryTotals = getCategorySummaryTotals(
    categorySummary,
    createTransactionsDataError,
  );

  return {
    period: formatReportingPeriod(period),
    transactionCount: summaryTotals.transactionCount,
    totalExpense: summaryTotals.totalAmount,
  };
}

async function listTransactions(
  apiClient: TransactionsApiClient,
  params: ListTransactionsParams,
  signal?: AbortSignal,
): Promise<TransactionPage> {
  const { fromDate, toDate } = getReportingPeriodBounds(params.period);
  const pageSize = Math.min(
    Math.max(1, Math.trunc(params.pageSize)),
    MAX_PAGE_SIZE,
  );
  const [categoriesResponse, summaryResponse, transactionsResponse] =
    await Promise.all([
      requireApiResponse(
        await apiClient.get<readonly CategoryCatalogItem[]>("/categories", {
          signal,
        }),
        "Category catalog",
        createTransactionsDataError,
      ),
      apiClient.get<CategorySummaryResponse>(
        buildMonthlyCategorySummaryPath(params.period),
        { signal },
      ),
      apiClient.get<TransactionHistoryPage>(
        buildApiPath("/transactions", {
          fromDate,
          toDate,
          pageSize: String(pageSize),
          cursor: params.cursor ?? undefined,
        }),
        { signal },
      ),
    ]);
  const categories = requireCategoryCatalog(
    categoriesResponse,
  );
  const categorySummary = requireMonthlyCategorySummary(
    requireApiResponse(
      summaryResponse,
      "monthly Category Summary",
      createTransactionsDataError,
    ),
    createTransactionsDataError,
  );
  const transactionPage = requireTransactionHistoryPage(
    requireApiResponse(
      transactionsResponse,
      "Transaction history page",
      createTransactionsDataError,
    ),
    createTransactionsDataError,
  );
  const statementImports = await loadStatementImports(
    apiClient,
    transactionPage.items,
    signal,
  );
  const categoryById = projectCategoryCatalog(categories);

  return {
    items: transactionPage.items.map((transaction) =>
      projectTransactionHistoryItem(
        transaction,
        categoryById,
        statementImports,
        createTransactionsDataError,
      ),
    ),
    nextCursor: transactionPage.nextCursor,
    summary: createTransactionSummary(categorySummary, params.period),
  };
}

export { TransactionsDataError, listTransactions };
export type {
  ListTransactionsParams,
  Transaction,
  TransactionPage,
  TransactionSummary,
  TransactionsApiClient,
};
