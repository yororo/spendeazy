import { loadStatementImports } from "@/shared/account";
import {
  buildApiPath,
  isRecord,
  buildMonthlyCategorySummaryPath,
  getCategorySummaryTotals,
  requireApiResponse,
  requireMonthlyCategorySummary,
  requireTransactionHistoryPage,
  requireTransactionResponse,
  type ApiClient,
  type CategorySummaryResponse,
  type TransactionResponse,
  type TransactionHistoryPage,
} from "@/shared/api";
import {
  isCategoryCatalog,
  projectCategoryCatalog,
  type CategoryCatalogItem,
} from "@/shared/category";
import {
  formatReportingPeriod,
  getReportingPeriodBounds,
  type ReportingPeriod,
} from "@/shared/reporting-period";
import {
  projectTransactionHistoryItem,
  type TransactionProjection,
} from "@/shared/transaction";

interface TransactionSummary {
  period: string;
  transactionCount: number;
  totalExpense: number;
}

interface ListTransactionsParams {
  period: ReportingPeriod;
  pageSize: number;
  cursor?: string | null;
  spaceId?: string;
}

interface TransactionPage {
  items: readonly TransactionProjection[];
  nextCursor: string | null;
  summary: TransactionSummary;
  categories: readonly CategoryCatalogItem[];
}

interface CreateTransactionInput {
  readonly spaceId?: string;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
  readonly categoryId?: string | null;
}

interface UpdateTransactionInput {
  readonly spaceId?: string;
  readonly transactionId: string;
  readonly purchaseDate?: string;
  readonly description?: string;
  readonly amount?: string;
  readonly categoryId?: string | null;
  readonly updatedAt?: string;
}

interface TransactionActivity {
  readonly id: string;
  readonly transactionId: string;
  readonly type: "created";
  readonly actorUserId: string;
  readonly occurredAt: string;
}

type TransactionsApiClient = Pick<
  ApiClient,
  "get" | "post" | "patch" | "delete"
>;

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

function isTransactionActivity(value: unknown): value is TransactionActivity {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.transactionId === "string" &&
    value.type === "created" &&
    typeof value.actorUserId === "string" &&
    typeof value.occurredAt === "string" &&
    Number.isFinite(Date.parse(value.occurredAt))
  );
}

function requireTransactionActivity(
  response: unknown,
): readonly TransactionActivity[] {
  if (!Array.isArray(response) || !response.every(isTransactionActivity)) {
    throw createTransactionsDataError(
      "The API returned invalid Transaction activity.",
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
        await apiClient.get<readonly CategoryCatalogItem[]>(
          buildCategoryCollectionPath(params.spaceId),
          { signal },
        ),
        "Category catalog",
        createTransactionsDataError,
      ),
      apiClient.get<CategorySummaryResponse>(
        buildMonthlyCategorySummaryPath(params.period, params.spaceId),
        { signal },
      ),
        apiClient.get<TransactionHistoryPage>(
        buildApiPath(buildTransactionCollectionPath(params.spaceId), {
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
    params.spaceId,
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
    categories,
  };
}

async function createTransaction(
  apiClient: TransactionsApiClient,
  input: CreateTransactionInput,
): Promise<TransactionResponse> {
  const response = await apiClient.post<unknown>(
    buildTransactionCollectionPath(input.spaceId),
    {
      purchaseDate: input.purchaseDate,
      description: input.description,
      amount: input.amount,
      ...(input.categoryId === undefined
        ? {}
        : { categoryId: input.categoryId }),
    },
    { expectedStatuses: [201] },
  );

  return requireTransactionResponse(
    requireApiResponse(
      response,
      "created Transaction",
      createTransactionsDataError,
    ),
    "created Transaction",
    createTransactionsDataError,
  );
}

async function getTransactionActivity(
  apiClient: Pick<TransactionsApiClient, "get">,
  transactionId: string,
  spaceId?: string,
  signal?: AbortSignal,
): Promise<readonly TransactionActivity[]> {
  const response = await apiClient.get<unknown>(
    buildTransactionActivityPath(transactionId, spaceId),
    { signal },
  );

  return requireTransactionActivity(
    requireApiResponse(
      response,
      "Transaction activity",
      createTransactionsDataError,
    ),
  );
}

async function updateTransaction(
  apiClient: TransactionsApiClient,
  input: UpdateTransactionInput,
): Promise<TransactionResponse> {
  const response = await apiClient.patch<unknown>(
    buildTransactionPath(input.transactionId, input.spaceId),
    {
      ...(input.purchaseDate === undefined
        ? {}
        : { purchaseDate: input.purchaseDate }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.amount === undefined ? {} : { amount: input.amount }),
      ...(input.categoryId === undefined
        ? {}
        : { categoryId: input.categoryId }),
      ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
    },
    { expectedStatuses: [200] },
  );

  return requireTransactionResponse(
    requireApiResponse(
      response,
      "updated Transaction",
      createTransactionsDataError,
    ),
    "updated Transaction",
    createTransactionsDataError,
  );
}

async function deleteTransaction(
  apiClient: TransactionsApiClient,
  transactionId: string,
  spaceId?: string,
  updatedAt?: string,
): Promise<void> {
  await apiClient.delete(buildTransactionPath(transactionId, spaceId), {
    ...(updatedAt === undefined
      ? {}
      : { headers: { "If-Match": updatedAt } }),
    expectedStatuses: [204],
  });
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

function buildTransactionPath(transactionId: string, spaceId?: string): string {
  return `${buildTransactionCollectionPath(spaceId)}/${encodeURIComponent(transactionId)}`;
}

function buildTransactionActivityPath(
  transactionId: string,
  spaceId?: string,
): string {
  return `${buildTransactionPath(transactionId, spaceId)}/activity`;
}

export {
  TransactionsDataError,
  buildCategoryCollectionPath,
  buildTransactionCollectionPath,
  buildTransactionActivityPath,
  buildTransactionPath,
  createTransaction,
  deleteTransaction,
  getTransactionActivity,
  listTransactions,
  updateTransaction,
};
export type {
  CreateTransactionInput,
  ListTransactionsParams,
  TransactionActivity,
  TransactionPage,
  TransactionSummary,
  TransactionProjection as Transaction,
  TransactionsApiClient,
  UpdateTransactionInput,
};
