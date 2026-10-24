import { API_BASE_URL } from '../config/api.ts';
import { ExpenseApiError, ExpenseApiTransportError } from './request-failure.ts';
export { ExpenseApiError, ExpenseApiTransportError } from './request-failure.ts';

export interface AuthorizedRequestOptions {
  getAccessToken: () => Promise<string | null>;
  baseUrl?: string | null;
  execute?: <T>(operation: () => Promise<T>) => Promise<T>;
}

export async function authorizedRequest<T>(
  options: AuthorizedRequestOptions,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; ifMatch?: string } = {},
): Promise<T> {
  const operation = () => sendAuthorizedRequest<T>(options, path, init);
  return options.execute ? options.execute(operation) : operation();
}

async function sendAuthorizedRequest<T>(
  options: AuthorizedRequestOptions,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; ifMatch?: string },
): Promise<T> {
  const resolvedBaseUrl = options.baseUrl ?? API_BASE_URL;
  if (resolvedBaseUrl === null) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL before creating the API client');
  }

  const token = await options.getAccessToken();
  if (!token) {
    throw new ExpenseApiError(
      401,
      'MISSING_ACCESS_TOKEN',
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
    response = await fetch(`${resolvedBaseUrl.replace(/\/+$/u, '')}${path}`, {
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
