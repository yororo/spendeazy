import { loadStatementImports } from "@/shared/account";
import {
  buildApiPath,
  isRecord,
  parseApiMoney,
  buildMonthlyCategorySummaryPath,
  getCategorySummaryTotals,
  requireApiResponse,
  requireMonthlyCategorySummary,
  requireExpenseHistoryPage,
  requireExpenseResponse,
  type ApiClient,
  type CategorySummaryResponse,
  type ExpenseResponse,
  type ExpenseHistoryPage,
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
  projectExpenseHistoryItem,
  type ExpenseProjection,
} from "@/shared/expense";
import { centsToMoney, moneyToCents } from "@/shared/money";

interface ExpenseSummary {
  period: string;
  expenseCount: number;
  totalExpense: number;
  activityFromDate?: string | null;
  activityToDate?: string | null;
}

interface ExpenseListFilters {
  readonly search: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly categoryId: string;
  readonly accountKey: string;
}

interface ListExpensesParams {
  statementImportId?: string;
  period: ReportingPeriod;
  pageSize: number;
  cursor?: string | null;
  spaceId?: string;
  description?: string;
  fromDate?: string;
  toDate?: string;
  categoryId?: string;
  categoryState?: "uncategorized";
  accountBank?: string;
  accountCardType?: string;
  source?: "manual";
}

interface ExpensePage {
  statement?: { readonly fileName: string; readonly account: string };
  items: readonly ExpenseProjection[];
  nextCursor: string | null;
  summary: ExpenseSummary;
  categories: readonly CategoryCatalogItem[];
  totalCount: number;
}

interface CreateExpenseInput {
  readonly spaceId?: string;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
  readonly categoryId?: string | null;
}

interface UpdateExpenseInput {
  readonly spaceId?: string;
  readonly expenseId: string;
  readonly purchaseDate?: string;
  readonly description?: string;
  readonly amount?: string;
  readonly categoryId?: string | null;
  readonly updatedAt?: string;
}

interface ExpenseActivitySnapshot {
  readonly categoryId: string | null;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
}

interface ExpenseCreatedActivity {
  readonly id: string;
  readonly expenseId: string;
  readonly type: "created";
  readonly actorUserId: string;
  readonly occurredAt: string;
}

interface ExpenseEditedActivity {
  readonly id: string;
  readonly expenseId: string;
  readonly type: "edited";
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly before: ExpenseActivitySnapshot;
  readonly after: ExpenseActivitySnapshot;
}

interface ExpenseDeletedActivity {
  readonly id: string;
  readonly expenseId: string;
  readonly type: "deleted";
  readonly actorUserId: string;
  readonly occurredAt: string;
}

type ExpenseActivity =
  | ExpenseCreatedActivity
  | ExpenseEditedActivity
  | ExpenseDeletedActivity;

interface ListDeletedExpensesParams {
  readonly pageSize: number;
  readonly cursor?: string | null;
  readonly spaceId?: string;
}

interface DeletedExpensePage {
  readonly items: readonly ExpenseProjection[];
  readonly nextCursor: string | null;
}

type ExpensesApiClient = Pick<
  ApiClient,
  "get" | "post" | "patch" | "delete"
>;

class ExpensesDataError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ExpensesDataError";
  }
}

const createExpensesDataError = (message: string) =>
  new ExpensesDataError(message);

function requireCategoryCatalog(
  response: unknown,
): readonly CategoryCatalogItem[] {
  if (!isCategoryCatalog(response)) {
    throw createExpensesDataError(
      "The API returned an invalid Category catalog.",
    );
  }

  return response;
}

function isExpenseActivitySnapshot(
  value: unknown,
): value is ExpenseActivitySnapshot {
  return (
    isRecord(value) &&
    (value.categoryId === null || typeof value.categoryId === "string") &&
    typeof value.purchaseDate === "string" &&
    typeof value.description === "string" &&
    typeof value.amount === "string"
  );
}

function isExpenseActivity(value: unknown): value is ExpenseActivity {
  const hasCommonFields =
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.expenseId === "string" &&
    typeof value.actorUserId === "string" &&
    typeof value.occurredAt === "string" &&
    Number.isFinite(Date.parse(value.occurredAt));

  if (!hasCommonFields) return false;

  return (
    value.type === "created" ||
    value.type === "deleted" ||
    (value.type === "edited" &&
      isExpenseActivitySnapshot(value.before) &&
      isExpenseActivitySnapshot(value.after))
  );
}

function requireExpenseActivity(
  response: unknown,
): readonly ExpenseActivity[] {
  if (!Array.isArray(response) || !response.every(isExpenseActivity)) {
    throw createExpensesDataError(
      "The API returned invalid Expense activity.",
    );
  }

  return response;
}

const MAX_PAGE_SIZE = 100;

function hasExpenseFilters(params: ListExpensesParams): boolean {
  return Boolean(params.statementImportId || params.description || params.fromDate || params.toDate ||
    params.categoryId || params.categoryState || params.accountBank || params.source);
}

function hasActiveExpenseFilters(filters: ExpenseListFilters): boolean {
  return Boolean(filters.search.trim() || filters.fromDate || filters.toDate ||
    filters.categoryId !== "all" || filters.accountKey !== "all");
}

function buildExpenseListPath(params: ListExpensesParams, pageSize: number, cursor?: string | null) {
  const { fromDate, toDate } = getReportingPeriodBounds(params.period);
  return buildApiPath(buildExpenseCollectionPath(params.spaceId), {
    fromDate: params.statementImportId ? params.fromDate : params.fromDate && params.fromDate > fromDate ? params.fromDate : fromDate,
    toDate: params.statementImportId ? params.toDate : params.toDate && params.toDate < toDate ? params.toDate : toDate,
    statementImportId: params.statementImportId,
    description: params.description || undefined,
    categoryId: params.categoryId,
    categoryState: params.categoryState,
    accountBank: params.accountBank,
    accountCardType: params.accountCardType,
    source: params.source,
    pageSize: String(pageSize),
    cursor: cursor ?? undefined,
  });
}

async function loadFilteredSummary(apiClient: ExpensesApiClient, params: ListExpensesParams, signal?: AbortSignal): Promise<ExpenseSummary> {
  let cursor: string | null = null;
  let expenseCount = 0;
  let totalCents = 0;
  let activityFromDate: string | null = null;
  let activityToDate: string | null = null;
  const seenCursors = new Set<string>();
  // The history API provides a filtered count, but no filtered expense sum.
  // Traverse every page with the same filters; UI pagination is independent.
  do {
    const page = requireExpenseHistoryPage(requireApiResponse(
      await apiClient.get<ExpenseHistoryPage>(buildExpenseListPath(params, MAX_PAGE_SIZE, cursor), { signal }),
      "filtered Expense history page", createExpensesDataError,
    ), createExpensesDataError);
    expenseCount += page.items.length;
    for (const item of page.items) {
      if (activityFromDate === null || item.purchaseDate < activityFromDate) activityFromDate = item.purchaseDate;
      if (activityToDate === null || item.purchaseDate > activityToDate) activityToDate = item.purchaseDate;
      totalCents += moneyToCents(parseApiMoney(item.amount, "Expense amount", createExpensesDataError));
    }
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) throw createExpensesDataError("The API repeated an Expense history cursor.");
      seenCursors.add(cursor);
    }
  } while (cursor !== null);
  return {
    period: params.statementImportId ? `Statement Import #${params.statementImportId}` : formatReportingPeriod(params.period),
    expenseCount, totalExpense: centsToMoney(totalCents),
    ...(params.statementImportId ? { activityFromDate, activityToDate } : {}),
  };
}

function createExpenseSummary(
  categorySummary: CategorySummaryResponse,
  period: ReportingPeriod,
): ExpenseSummary {
  const summaryTotals = getCategorySummaryTotals(
    categorySummary,
    createExpensesDataError,
  );

  return {
    period: formatReportingPeriod(period),
    expenseCount: summaryTotals.expenseCount,
    totalExpense: summaryTotals.totalAmount,
  };
}

async function listExpenses(
  apiClient: ExpensesApiClient,
  params: ListExpensesParams,
  signal?: AbortSignal,
): Promise<ExpensePage> {
  const pageSize = Math.min(
    Math.max(1, Math.trunc(params.pageSize)),
    MAX_PAGE_SIZE,
  );
  const summaryPromise = hasExpenseFilters(params)
    ? loadFilteredSummary(apiClient, params, signal)
    : apiClient.get<CategorySummaryResponse>(buildMonthlyCategorySummaryPath(params.period, params.spaceId), { signal }).then((response) =>
      createExpenseSummary(requireMonthlyCategorySummary(requireApiResponse(response, "monthly Category Summary", createExpensesDataError), createExpensesDataError), params.period));
  const [categoriesResponse, summary, expensesResponse] =
    await Promise.all([
      apiClient.get<readonly CategoryCatalogItem[]>(
          buildCategoryCollectionPath(params.spaceId),
          { signal },
        ).then((response) => requireApiResponse(response,
        "Category catalog",
        createExpensesDataError,
      )),
      summaryPromise,
        apiClient.get<ExpenseHistoryPage>(
        buildExpenseListPath(params, pageSize, params.cursor),
        { signal },
      ),
    ]);
  const categories = requireCategoryCatalog(
    categoriesResponse,
  );
  const expensePage = requireExpenseHistoryPage(
    requireApiResponse(
      expensesResponse,
      "Expense history page",
      createExpensesDataError,
    ),
    createExpensesDataError,
  );
  const statementImports = await loadStatementImports(
    apiClient,
    expensePage.items,
    signal,
    params.spaceId,
  );
  const categoryById = projectCategoryCatalog(categories);
  let statement: ExpensePage["statement"];
  if (params.statementImportId) {
    const collection = params.spaceId === undefined ? "/statement-imports" : `/spaces/${encodeURIComponent(params.spaceId)}/statement-imports`;
    const metadata = await apiClient.get<unknown>(`${collection}/${encodeURIComponent(params.statementImportId)}`, { signal });
    if (!isRecord(metadata) || metadata.id !== params.statementImportId ||
        typeof metadata.fileName !== "string" || typeof metadata.bank !== "string" ||
        (metadata.cardType !== null && typeof metadata.cardType !== "string")) {
      throw createExpensesDataError("The requested Statement Import is unavailable.");
    }
    statement = { fileName: metadata.fileName, account: [metadata.bank, metadata.cardType].filter(Boolean).join(" · ") };
  }

  return {
    ...(statement ? { statement } : {}),
    items: expensePage.items.map((expense) =>
      projectExpenseHistoryItem(
        expense,
        categoryById,
        statementImports,
        createExpensesDataError,
      ),
    ),
    nextCursor: expensePage.nextCursor,
    totalCount: hasExpenseFilters(params) ? summary.expenseCount : Number(expensePage.totalCount ?? summary.expenseCount),
    summary,
    categories,
  };
}

async function listDeletedExpenses(
  apiClient: ExpensesApiClient,
  params: ListDeletedExpensesParams,
  signal?: AbortSignal,
): Promise<DeletedExpensePage> {
  const pageSize = Math.min(
    Math.max(1, Math.trunc(params.pageSize)),
    MAX_PAGE_SIZE,
  );
  const [categoriesResponse, expensesResponse] = await Promise.all([
    requireApiResponse(
      await apiClient.get<readonly CategoryCatalogItem[]>(
        buildCategoryCollectionPath(params.spaceId),
        { signal },
      ),
      "Category catalog",
      createExpensesDataError,
    ),
    apiClient.get<ExpenseHistoryPage>(
      buildApiPath(buildDeletedExpenseCollectionPath(params.spaceId), {
        pageSize: String(pageSize),
        cursor: params.cursor ?? undefined,
      }),
      { signal },
    ),
  ]);
  const categories = requireCategoryCatalog(categoriesResponse);
  const expensePage = requireExpenseHistoryPage(
    requireApiResponse(
      expensesResponse,
      "deleted Expense history page",
      createExpensesDataError,
    ),
    createExpensesDataError,
  );
  const statementImports = await loadStatementImports(
    apiClient,
    expensePage.items,
    signal,
    params.spaceId,
  );
  const categoryById = projectCategoryCatalog(categories);

  return {
    items: expensePage.items.map((expense) =>
      projectExpenseHistoryItem(
        expense,
        categoryById,
        statementImports,
        createExpensesDataError,
      ),
    ),
    nextCursor: expensePage.nextCursor,
  };
}

async function createExpense(
  apiClient: ExpensesApiClient,
  input: CreateExpenseInput,
): Promise<ExpenseResponse> {
  const response = await apiClient.post<unknown>(
    buildExpenseCollectionPath(input.spaceId),
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

  return requireExpenseResponse(
    requireApiResponse(
      response,
      "created Expense",
      createExpensesDataError,
    ),
    "created Expense",
    createExpensesDataError,
  );
}

async function getExpenseActivity(
  apiClient: Pick<ExpensesApiClient, "get">,
  expenseId: string,
  spaceId?: string,
  signal?: AbortSignal,
): Promise<readonly ExpenseActivity[]> {
  const response = await apiClient.get<unknown>(
    buildExpenseActivityPath(expenseId, spaceId),
    { signal },
  );

  return requireExpenseActivity(
    requireApiResponse(
      response,
      "Expense activity",
      createExpensesDataError,
    ),
  );
}

async function updateExpense(
  apiClient: ExpensesApiClient,
  input: UpdateExpenseInput,
): Promise<ExpenseResponse> {
  const response = await apiClient.patch<unknown>(
    buildExpensePath(input.expenseId, input.spaceId),
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

  return requireExpenseResponse(
    requireApiResponse(
      response,
      "updated Expense",
      createExpensesDataError,
    ),
    "updated Expense",
    createExpensesDataError,
  );
}

async function deleteExpense(
  apiClient: ExpensesApiClient,
  expenseId: string,
  spaceId?: string,
  updatedAt?: string,
): Promise<void> {
  await apiClient.delete(buildExpensePath(expenseId, spaceId), {
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

function buildExpenseCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/expenses"
    : `/spaces/${encodeURIComponent(spaceId)}/expenses`;
}

function buildDeletedExpenseCollectionPath(spaceId?: string): string {
  return `${buildExpenseCollectionPath(spaceId)}/history`;
}

function buildExpensePath(expenseId: string, spaceId?: string): string {
  return `${buildExpenseCollectionPath(spaceId)}/${encodeURIComponent(expenseId)}`;
}

function buildExpenseActivityPath(
  expenseId: string,
  spaceId?: string,
): string {
  return `${buildExpensePath(expenseId, spaceId)}/activity`;
}

export {
  ExpensesDataError,
  buildCategoryCollectionPath,
  buildExpenseCollectionPath,
  buildDeletedExpenseCollectionPath,
  buildExpenseActivityPath,
  buildExpensePath,
  createExpense,
  deleteExpense,
  getExpenseActivity,
  hasActiveExpenseFilters,
  listExpenses,
  listDeletedExpenses,
  updateExpense,
};
export type {
  CreateExpenseInput,
  DeletedExpensePage,
  ListDeletedExpensesParams,
  ListExpensesParams,
  ExpenseActivity,
  ExpenseActivitySnapshot,
  ExpensePage,
  ExpenseListFilters,
  ExpenseSummary,
  ExpenseProjection as Expense,
  ExpensesApiClient,
  UpdateExpenseInput,
};
