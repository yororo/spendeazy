import { isValidDomainDate } from '../../http/domain-date';
import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import type { ExpenseCursorPosition, ExpenseFilters } from './expense-store';

const CURSOR_VERSION = 2;
const CURSOR_ORDERING = 'purchaseDate:desc,id:desc' as const;
const CURSOR_FILTER_KEYS = [
  'fromDate',
  'toDate',
  'categoryId',
  'categoryState',
  'statementImportId',
  'source',
  'description',
  'accountBank',
  'accountCardType',
] as const;

export interface NormalizedExpenseFilters {
  fromDate: string | null;
  toDate: string | null;
  categoryId: string | null;
  categoryState: ExpenseFilters['categoryState'] | null;
  statementImportId: string | null;
  source: ExpenseFilters['source'] | null;
  description: string | null;
  accountBank: string | null;
  accountCardType: string | null;
}

export interface DecodedExpenseCursor {
  position: ExpenseCursorPosition;
  filters: NormalizedExpenseFilters;
  ordering: typeof CURSOR_ORDERING;
}

interface ExpenseCursorPayload extends DecodedExpenseCursor {
  version: typeof CURSOR_VERSION;
}

export function normalizeExpenseFilters(
  filters: ExpenseFilters,
): NormalizedExpenseFilters {
  return {
    fromDate: filters.fromDate ?? null,
    toDate: filters.toDate ?? null,
    categoryId: filters.categoryId ?? null,
    categoryState: filters.categoryState ?? null,
    statementImportId: filters.statementImportId ?? null,
    source: filters.source ?? null,
    description: filters.description ?? null,
    accountBank: filters.accountBank ?? null,
    accountCardType: filters.accountCardType ?? null,
  };
}

export function encodeExpenseCursor(
  position: ExpenseCursorPosition,
  filters: ExpenseFilters,
): string {
  const payload: ExpenseCursorPayload = {
    version: CURSOR_VERSION,
    ordering: CURSOR_ORDERING,
    position,
    filters: normalizeExpenseFilters(filters),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeExpenseCursor(
  cursor: string,
  filters: ExpenseFilters,
): DecodedExpenseCursor {
  const payload = parseCursorPayload(cursor);
  const expectedFilters = normalizeExpenseFilters(filters);

  if (!sameFilters(payload.filters, expectedFilters)) {
    throw new InvalidExpenseCursorError('incompatible');
  }

  return {
    position: payload.position,
    filters: payload.filters,
    ordering: payload.ordering,
  };
}

class InvalidExpenseCursorError extends ApplicationError {
  constructor(reason: 'invalid_format' | 'incompatible') {
    const details: ErrorDetail[] = [
      {
        field: '/cursor',
        code: reason,
        message:
          reason === 'incompatible'
            ? 'Cursor does not match the requested expense filters'
            : 'Cursor must be a valid expense page cursor',
      },
    ];
    super('VALIDATION_FAILED', 'The request contains invalid fields.', details);
  }
}

function parseCursorPayload(cursor: string): ExpenseCursorPayload {
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    throw new InvalidExpenseCursorError('invalid_format');
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidExpenseCursorError('invalid_format');
  }

  if (!isCursorPayload(value)) {
    throw new InvalidExpenseCursorError('invalid_format');
  }

  return value;
}

function isCursorPayload(value: unknown): value is ExpenseCursorPayload {
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

function isCursorPosition(value: unknown): value is ExpenseCursorPosition {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'purchaseDate') &&
    Object.hasOwn(value, 'expenseId') &&
    isValidDomainDate(value.purchaseDate) &&
    typeof value.expenseId === 'string' &&
    /^[1-9]\d*$/u.test(value.expenseId)
  );
}

function isNormalizedFilters(
  value: unknown,
): value is NormalizedExpenseFilters {
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
    isNullableSource(value.source) &&
    isNullableText(value.description) &&
    isNullableText(value.accountBank) &&
    isNullableText(value.accountCardType)
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
): value is NormalizedExpenseFilters['categoryState'] {
  return value === null || value === 'categorized' || value === 'uncategorized';
}

function isNullableSource(
  value: unknown,
): value is NormalizedExpenseFilters['source'] {
  return value === null || value === 'manual' || value === 'imported';
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function sameFilters(
  left: NormalizedExpenseFilters,
  right: NormalizedExpenseFilters,
): boolean {
  return CURSOR_FILTER_KEYS.every((key) => left[key] === right[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
