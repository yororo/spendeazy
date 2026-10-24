import { isValidDomainDate } from '../../http/domain-date';
import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import type { ExpenseCursorPosition, ExpenseFilters } from './expense-store';

const CURSOR_VERSION = 3;
const CURSOR_FILTER_KEYS = [
  'fromDate',
  'toDate',
  'categoryId',
  'statementImportId',
  'source',
  'description',
  'sort',
] as const;

export interface NormalizedExpenseFilters {
  fromDate: string | null;
  toDate: string | null;
  categoryId: string | null;
  statementImportId: string | null;
  source: ExpenseFilters['source'] | null;
  description: string | null;
  sort: NonNullable<ExpenseFilters['sort']>;
}

export interface DecodedExpenseCursor {
  position: ExpenseCursorPosition;
  filters: NormalizedExpenseFilters;
  spaceId: string;
  deletedOnly: boolean;
  ordering: ExpenseCursorOrdering;
}

type ExpenseCursorOrdering =
  | 'expenseDate:desc,id:desc'
  | 'expenseDate:asc,id:asc'
  | 'deletedAt:desc,id:desc';

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
    statementImportId: filters.statementImportId ?? null,
    source: filters.source ?? null,
    description: filters.description ?? null,
    sort: filters.sort ?? 'newest',
  };
}

export function encodeExpenseCursor(
  position: ExpenseCursorPosition,
  filters: ExpenseFilters,
  spaceId: string,
  deletedOnly = false,
): string {
  const payload: ExpenseCursorPayload = {
    version: CURSOR_VERSION,
    ordering: cursorOrdering(filters, deletedOnly),
    position,
    filters: normalizeExpenseFilters(filters),
    spaceId,
    deletedOnly,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeExpenseCursor(
  cursor: string,
  filters: ExpenseFilters,
  spaceId: string,
  deletedOnly = false,
): DecodedExpenseCursor {
  const payload = parseCursorPayload(cursor);
  const expectedFilters = normalizeExpenseFilters(filters);

  if (
    !sameFilters(payload.filters, expectedFilters) ||
    payload.spaceId !== spaceId ||
    payload.deletedOnly !== deletedOnly ||
    payload.ordering !== cursorOrdering(filters, deletedOnly)
  ) {
    throw new InvalidExpenseCursorError('incompatible');
  }

  return {
    position: payload.position,
    filters: payload.filters,
    spaceId: payload.spaceId,
    deletedOnly: payload.deletedOnly,
    ordering: payload.ordering,
  };
}

function cursorOrdering(
  filters: ExpenseFilters,
  deletedOnly: boolean,
): ExpenseCursorOrdering {
  if (deletedOnly) return 'deletedAt:desc,id:desc';
  return filters.sort === 'oldest'
    ? 'expenseDate:asc,id:asc'
    : 'expenseDate:desc,id:desc';
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
    Object.keys(value).length === 6 &&
    Object.hasOwn(value, 'version') &&
    Object.hasOwn(value, 'ordering') &&
    Object.hasOwn(value, 'position') &&
    Object.hasOwn(value, 'filters') &&
    Object.hasOwn(value, 'spaceId') &&
    Object.hasOwn(value, 'deletedOnly') &&
    value.version === CURSOR_VERSION &&
    isCursorOrdering(value.ordering) &&
    isCursorPosition(value.position, value.ordering) &&
    isNormalizedFilters(value.filters) &&
    typeof value.spaceId === 'string' &&
    /^[1-9]\d*$/u.test(value.spaceId) &&
    typeof value.deletedOnly === 'boolean'
  );
}

function isCursorPosition(
  value: unknown,
  ordering: ExpenseCursorOrdering,
): value is ExpenseCursorPosition {
  if (
    !isRecord(value) ||
    typeof value.expenseId !== 'string' ||
    !/^[1-9]\d*$/u.test(value.expenseId)
  ) {
    return false;
  }
  if (ordering === 'deletedAt:desc,id:desc') {
    return (
      Object.keys(value).length === 2 &&
      Object.hasOwn(value, 'deletedAt') &&
      isUtcTimestamp(value.deletedAt)
    );
  }
  return (
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'expenseDate') &&
    isValidDomainDate(value.expenseDate)
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
    isNullablePositiveId(value.statementImportId) &&
    isNullableSource(value.source) &&
    isNullableText(value.description) &&
    (value.sort === 'newest' || value.sort === 'oldest')
  );
}

function isCursorOrdering(value: unknown): value is ExpenseCursorOrdering {
  return (
    value === 'expenseDate:desc,id:desc' ||
    value === 'expenseDate:asc,id:asc' ||
    value === 'deletedAt:desc,id:desc'
  );
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isNullableDomainDate(value: unknown): value is string | null {
  return value === null || isValidDomainDate(value);
}

function isNullablePositiveId(value: unknown): value is string | null {
  return (
    value === null || (typeof value === 'string' && /^[1-9]\d*$/u.test(value))
  );
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
