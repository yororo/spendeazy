export class ExpenseApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown[];
  readonly review: unknown;
  constructor(status: number, code: string, message: string, details: unknown[] = [], review?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.review = review;
    this.name = 'ExpenseApiError';
  }
}

export { ExpenseApiError as ApiError };

export class ExpenseApiTransportError extends Error {
  constructor() { super('Could not reach the Spendeazy API'); this.name = 'ExpenseApiTransportError'; }
}

export class InvalidApiResponseError extends Error {
  constructor() { super('The API response could not be read. Try again.'); this.name = 'InvalidApiResponseError'; }
}

export class ObsoleteRequestError extends Error {
  constructor() { super('This request belongs to an older session or Space.'); this.name = 'ObsoleteRequestError'; }
}

export type RequestFailure = 'missing-credentials' | 'expired' | 'transport' | 'invalid-response' | 'rejected' | 'unexpected' | 'obsolete';

export function requestFailure(cause: unknown): RequestFailure {
  if (cause instanceof ObsoleteRequestError) return 'obsolete';
  if (cause instanceof ExpenseApiTransportError) return 'transport';
  if (cause instanceof InvalidApiResponseError) return 'invalid-response';
  if (cause instanceof ExpenseApiError) {
    if (cause.code === 'MISSING_ACCESS_TOKEN') return 'missing-credentials';
    if (cause.status === 401) return 'expired';
    if (cause.code === 'INVALID_API_RESPONSE') return 'invalid-response';
    return 'rejected';
  }
  return 'unexpected';
}

export function requestFailureMessage(cause: unknown): string {
  if (cause instanceof ExpenseApiError && cause.code === 'SPACE_NOT_WRITABLE') {
    return 'This Shared Space was archived. No changes were saved. Your entered work is still here to inspect or copy.';
  }
  switch (requestFailure(cause)) {
    case 'missing-credentials': return 'Sign in before using Spendeazy.';
    case 'expired': return 'Your session expired. Sign in again to continue.';
    case 'transport': return 'Could not reach Spendeazy. Check your connection and try again.';
    case 'invalid-response': return 'The API response could not be read. Try again.';
    case 'rejected': return (cause as ExpenseApiError).message;
    case 'obsolete': return '';
    case 'unexpected': return 'The request could not be completed. Try again.';
  }
}

export function decodeApiResponse<T>(decode: () => T): T {
  try { return decode(); } catch { throw new InvalidApiResponseError(); }
}
