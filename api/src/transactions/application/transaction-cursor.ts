import { isValidDomainDate } from '../../http/domain-date';
import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import type {
  TransactionCursorPosition,
  TransactionFilters,
} from './transaction-store';

const CURSOR_VERSION = 1;
const CURSOR_ORDERING = 'purchaseDate:desc,id:desc' as const;
const CURSOR_FILTER_KEYS = [
  'fromDate',
  'toDate',
  'categoryId',
  'categoryState',
  'statementImportId',
  'source',
] as const;

export interface NormalizedTransactionFilters {
  fromDate: string | null;
  toDate: string | null;
  categoryId: string | null;
  categoryState: TransactionFilters['categoryState'] | null;
  statementImportId: string | null;
  source: TransactionFilters['source'] | null;
}

export interface DecodedTransactionCursor {
  position: TransactionCursorPosition;
  filters: NormalizedTransactionFilters;
  ordering: typeof CURSOR_ORDERING;
}

interface TransactionCursorPayload extends DecodedTransactionCursor {
  version: typeof CURSOR_VERSION;
}

export function normalizeTransactionFilters(
  filters: TransactionFilters,
): NormalizedTransactionFilters {
  return {
    fromDate: filters.fromDate ?? null,
    toDate: filters.toDate ?? null,
    categoryId: filters.categoryId ?? null,
    categoryState: filters.categoryState ?? null,
    statementImportId: filters.statementImportId ?? null,
    source: filters.source ?? null,
  };
}

export function encodeTransactionCursor(
  position: TransactionCursorPosition,
  filters: TransactionFilters,
): string {
  const payload: TransactionCursorPayload = {
    version: CURSOR_VERSION,
    ordering: CURSOR_ORDERING,
    position,
    filters: normalizeTransactionFilters(filters),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeTransactionCursor(
  cursor: string,
  filters: TransactionFilters,
): DecodedTransactionCursor {
  const payload = parseCursorPayload(cursor);
  const expectedFilters = normalizeTransactionFilters(filters);

  if (!sameFilters(payload.filters, expectedFilters)) {
    throw new InvalidTransactionCursorError('incompatible');
  }

  return {
    position: payload.position,
    filters: payload.filters,
    ordering: payload.ordering,
  };
}

class InvalidTransactionCursorError extends ApplicationError {
  constructor(reason: 'invalid_format' | 'incompatible') {
    const details: ErrorDetail[] = [
      {
        field: '/cursor',
        code: reason,
        message:
          reason === 'incompatible'
            ? 'Cursor does not match the requested transaction filters'
            : 'Cursor must be a valid transaction page cursor',
      },
    ];
    super('VALIDATION_FAILED', 'The request contains invalid fields.', details);
  }
}

function parseCursorPayload(cursor: string): TransactionCursorPayload {
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    throw new InvalidTransactionCursorError('invalid_format');
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidTransactionCursorError('invalid_format');
  }

  if (!isCursorPayload(value)) {
    throw new InvalidTransactionCursorError('invalid_format');
  }

  return value;
}

function isCursorPayload(value: unknown): value is TransactionCursorPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Object.keys(value).length === 4 &&
    Object.hasOwn(value, 'version') &&
    Object.hasOwn(value, 'ordering') &&
    Object.hasOwn(value, 'position') &&
    Object.hasOwn(value, 'filters') &&
    value.version === CURSOR_VERSION &&
    value.ordering === CURSOR_ORDERING &&
    isCursorPosition(value.position) &&
    isNormalizedFilters(value.filters)
  );
}

function isCursorPosition(value: unknown): value is TransactionCursorPosition {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'purchaseDate') &&
    Object.hasOwn(value, 'transactionId') &&
    isValidDomainDate(value.purchaseDate) &&
    typeof value.transactionId === 'string' &&
    /^[1-9]\d*$/u.test(value.transactionId)
  );
}

function isNormalizedFilters(
  value: unknown,
): value is NormalizedTransactionFilters {
  if (!isRecord(value)) {
    return false;
  }

  if (
    Object.keys(value).length !== CURSOR_FILTER_KEYS.length ||
    CURSOR_FILTER_KEYS.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }

  return (
    isNullableDomainDate(value.fromDate) &&
    isNullableDomainDate(value.toDate) &&
    isNullablePositiveId(value.categoryId) &&
    isNullableCategoryState(value.categoryState) &&
    isNullablePositiveId(value.statementImportId) &&
    isNullableSource(value.source)
  );
}

function isNullableDomainDate(value: unknown): value is string | null {
  return value === null || isValidDomainDate(value);
}

function isNullablePositiveId(value: unknown): value is string | null {
  return (
    value === null || (typeof value === 'string' && /^[1-9]\d*$/u.test(value))
  );
}

function isNullableCategoryState(
  value: unknown,
): value is NormalizedTransactionFilters['categoryState'] {
  return value === null || value === 'categorized' || value === 'uncategorized';
}

function isNullableSource(
  value: unknown,
): value is NormalizedTransactionFilters['source'] {
  return value === null || value === 'manual' || value === 'imported';
}

function sameFilters(
  left: NormalizedTransactionFilters,
  right: NormalizedTransactionFilters,
): boolean {
  return CURSOR_FILTER_KEYS.every((key) => left[key] === right[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
