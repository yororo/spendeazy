import {
  authorizedRequest,
  ExpenseApiError,
  ExpenseApiTransportError,
  type AuthorizedRequestOptions,
} from "./authorized-request.ts";

import {
  readExpenseActivityList,
  readExpensePage,
  readListedExpense,
  type ExpenseActivity,
  type ListedExpense,
  type ExpensePagePayload,
} from "./expense-response.ts";
export { ExpenseApiError, ExpenseApiTransportError };

export type ExpenseSource = "manual" | "imported";
export type ExpenseSort = "newest" | "oldest";

export type Expense = ListedExpense;

export type {
  ExpenseActivity,
  ExpenseActivitySnapshot,
} from "./expense-response.ts";

export type ExpensePage = ExpensePagePayload;

export interface ExpenseListQuery {
  fromDate?: string;
  toDate?: string;
  categoryId?: string;
  statementImportId?: string;
  source?: ExpenseSource;
  description?: string;
  sort?: ExpenseSort;
  pageSize?: number;
  cursor?: string;
}

export interface CreateManualExpenseInput {
  expenseDate: string;
  description: string;
  amount: string;
  categoryId: string;
}

export type UpdateExpenseInput = Partial<CreateManualExpenseInput> & {
  expectedRevision: string;
};

export interface ExpenseApiClient {
  listExpenses(spaceId: string, query?: ExpenseListQuery): Promise<ExpensePage>;
  listDeletedExpenses(
    spaceId: string,
    query?: ExpenseListQuery,
  ): Promise<ExpensePage>;
  getExpense(spaceId: string, expenseId: string): Promise<Expense>;
  listExpenseActivity(
    spaceId: string,
    expenseId: string,
  ): Promise<ExpenseActivity[]>;
  createManualExpense(
    spaceId: string,
    input: CreateManualExpenseInput,
  ): Promise<Expense>;
  updateExpense(
    spaceId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<Expense>;
  deleteExpense(
    spaceId: string,
    expenseId: string,
    expectedRevision: string,
  ): Promise<Expense>;
}

export type CreateExpenseApiClientOptions = AuthorizedRequestOptions;

export function createExpenseApiClient(
  options: CreateExpenseApiClientOptions,
): ExpenseApiClient {
  function request<T>(
    path: string,
    init: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      body?: unknown;
      ifMatch?: string;
    } = {},
  ): Promise<T> {
    return authorizedRequest<T>(options, path, init);
  }

  return {
    listExpenses: async (spaceId, query) => {
      const payload = await request<ExpensePage>(
        `${expenseCollectionPath(spaceId)}${queryString(query)}`,
      );
      return readExpensePage(payload);
    },
    listDeletedExpenses: async (spaceId, query) =>
      readExpensePage(
        await request(
          `${expenseCollectionPath(spaceId)}/deleted${queryString(query)}`,
        ),
      ),
    getExpense: async (spaceId, expenseId) => {
      const payload = await request<Expense>(
        expenseItemPath(spaceId, expenseId),
      );
      return readListedExpense(payload);
    },
    listExpenseActivity: async (spaceId, expenseId) =>
      readExpenseActivityList(
        await request<unknown>(
          `${expenseItemPath(spaceId, expenseId)}/activity`,
        ),
      ),
    createManualExpense: async (spaceId, input) => {
      const payload = await request<Expense>(expenseCollectionPath(spaceId), {
        method: "POST",
        body: input,
      });
      return readListedExpense(payload);
    },
    updateExpense: async (spaceId, expenseId, input) =>
      readListedExpense(
        await request<unknown>(expenseItemPath(spaceId, expenseId), {
          method: "PATCH",
          body: input,
        }),
      ),
    deleteExpense: async (spaceId, expenseId, expectedRevision) =>
      readListedExpense(
        await request<unknown>(expenseItemPath(spaceId, expenseId), {
          method: "DELETE",
          ifMatch: expectedRevision,
        }),
      ),
  };
}

function expenseCollectionPath(spaceId: string): string {
  return `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/expenses`;
}

function expenseItemPath(spaceId: string, expenseId: string): string {
  return `${expenseCollectionPath(spaceId)}/${encodeURIComponent(expenseId)}`;
}

function queryString(query: ExpenseListQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
