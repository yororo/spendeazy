import {
  authorizedRequest,
  ExpenseApiError,
  ExpenseApiTransportError,
  type AuthorizedRequestOptions,
} from '@/api/authorized-request';

export { ExpenseApiError, ExpenseApiTransportError };

export type ExpenseSource = 'manual' | 'imported';
export type ExpenseSort = 'newest' | 'oldest';

export interface Expense {
  id: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  amount: string;
  source: ExpenseSource;
  statementImportId: string | null;
  addedByUserId?: string;
  createdAt: string;
  updatedAt: string;
  revision: string;
  deletedAt?: string;
}

export interface ExpenseActivitySnapshot {
  categoryId: string;
  expenseDate: string;
  description: string;
  amount: string;
}

export interface ExpenseActivity {
  id: string;
  expenseId: string;
  type: 'created' | 'edited' | 'deleted';
  actorUserId: string;
  occurredAt: string;
  before?: ExpenseActivitySnapshot;
  after?: ExpenseActivitySnapshot;
}

export interface ExpensePage {
  expenses: Expense[];
  nextCursor: string | null;
  totalCount: string;
  totalAmount: string;
}

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
    init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; ifMatch?: string } = {},
  ): Promise<T> {
    return authorizedRequest<T>(options, path, init);
  }

  return {
    listExpenses: (spaceId, query) =>
      request(`${expenseCollectionPath(spaceId)}${queryString(query)}`),
    listDeletedExpenses: (spaceId, query) =>
      request(
        `${expenseCollectionPath(spaceId)}/deleted${queryString(query)}`,
      ),
    getExpense: (spaceId, expenseId) =>
      request(expenseItemPath(spaceId, expenseId)),
    listExpenseActivity: (spaceId, expenseId) =>
      request(`${expenseItemPath(spaceId, expenseId)}/activity`),
    createManualExpense: (spaceId, input) =>
      request(expenseCollectionPath(spaceId), { method: 'POST', body: input }),
    updateExpense: (spaceId, expenseId, input) =>
      request(expenseItemPath(spaceId, expenseId), {
        method: 'PATCH',
        body: input,
      }),
    deleteExpense: (spaceId, expenseId, expectedRevision) =>
      request(expenseItemPath(spaceId, expenseId), {
        method: 'DELETE',
        ifMatch: expectedRevision,
      }),
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
  return serialized ? `?${serialized}` : '';
}
