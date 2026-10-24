import { API_BASE_URL } from '@/config/api';

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

export interface CreateExpenseApiClientOptions {
  getAccessToken: () => Promise<string | null>;
  baseUrl?: string | null;
}

export class ExpenseApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = 'ExpenseApiError';
  }
}

export class ExpenseApiTransportError extends Error {
  constructor() {
    super('Could not reach the Spendeazy API');
    this.name = 'ExpenseApiTransportError';
  }
}

export function createExpenseApiClient(
  options: CreateExpenseApiClientOptions,
): ExpenseApiClient {
  const resolvedBaseUrl = options.baseUrl ?? API_BASE_URL;
  if (resolvedBaseUrl === null) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL before creating the API client');
  }
  const baseUrl: string = resolvedBaseUrl;

  async function request<T>(
    path: string,
    init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; ifMatch?: string } = {},
  ): Promise<T> {
    const token = await options.getAccessToken();
    if (!token) {
      throw new ExpenseApiError(
        401,
        'UNAUTHENTICATED',
        'Sign in before using the Spendeazy API',
      );
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.ifMatch !== undefined) headers['If-Match'] = `"${init.ifMatch}"`;

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/+$/u, '')}${path}`, {
        method: init.method ?? 'GET',
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      throw new ExpenseApiTransportError();
    }

    const payload = await readJson(response);
    if (!response.ok) {
      if (isApiErrorEnvelope(payload)) {
        throw new ExpenseApiError(
          response.status,
          payload.error.code,
          payload.error.message,
          payload.error.details,
        );
      }
      throw new ExpenseApiError(
        response.status,
        'API_ERROR',
        `The Spendeazy API returned HTTP ${response.status}`,
      );
    }
    return payload as T;
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

async function readJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body.length === 0) {
    throw new ExpenseApiError(
      response.status,
      'INVALID_API_RESPONSE',
      'The Spendeazy API returned an empty response',
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ExpenseApiError(
      response.status,
      'INVALID_API_RESPONSE',
      'The Spendeazy API returned invalid JSON',
    );
  }
}

function isApiErrorEnvelope(
  value: unknown,
): value is {
  error: { code: string; message: string; details: unknown[] };
} {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'details' in error &&
    Array.isArray(error.details)
  );
}
