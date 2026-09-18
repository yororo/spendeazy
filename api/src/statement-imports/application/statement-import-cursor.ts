import { isValidDomainDate } from '../../http/domain-date';
import {
  ApplicationError,
  type ErrorDetail,
} from '../../errors/application-error';
import type {
  StatementImportHistoryCursorPosition,
  StatementImportHistoryFilters,
} from './statement-import-store';

const CURSOR_VERSION = 1;
const CURSOR_ORDERING = 'statementDate:desc,id:desc' as const;
const CURSOR_FILTER_KEYS = ['fromDate', 'toDate'] as const;

export interface NormalizedStatementImportFilters {
  fromDate: string | null;
  toDate: string | null;
}

export interface DecodedStatementImportCursor {
  position: StatementImportHistoryCursorPosition;
  filters: NormalizedStatementImportFilters;
  ordering: typeof CURSOR_ORDERING;
}

interface StatementImportCursorPayload extends DecodedStatementImportCursor {
  version: typeof CURSOR_VERSION;
}

export function normalizeStatementImportFilters(
  filters: StatementImportHistoryFilters,
): NormalizedStatementImportFilters {
  return {
    fromDate: filters.fromDate ?? null,
    toDate: filters.toDate ?? null,
  };
}

export function encodeStatementImportCursor(
  position: StatementImportHistoryCursorPosition,
  filters: StatementImportHistoryFilters,
): string {
  const payload: StatementImportCursorPayload = {
    version: CURSOR_VERSION,
    ordering: CURSOR_ORDERING,
    position,
    filters: normalizeStatementImportFilters(filters),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeStatementImportCursor(
  cursor: string,
  filters: StatementImportHistoryFilters,
): DecodedStatementImportCursor {
  const payload = parseCursorPayload(cursor);
  const expectedFilters = normalizeStatementImportFilters(filters);

  if (!sameFilters(payload.filters, expectedFilters)) {
    throw new InvalidStatementImportCursorError('incompatible');
  }

  return {
    position: payload.position,
    filters: payload.filters,
    ordering: payload.ordering,
  };
}

class InvalidStatementImportCursorError extends ApplicationError {
  constructor(reason: 'invalid_format' | 'incompatible') {
    const details: ErrorDetail[] = [
      {
        field: '/cursor',
        code: reason,
        message:
          reason === 'incompatible'
            ? 'Cursor does not match the requested statement-import filters'
            : 'Cursor must be a valid statement-import page cursor',
      },
    ];
    super('VALIDATION_FAILED', 'The request contains invalid fields.', details);
  }
}

function parseCursorPayload(cursor: string): StatementImportCursorPayload {
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    throw new InvalidStatementImportCursorError('invalid_format');
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidStatementImportCursorError('invalid_format');
  }

  if (!isCursorPayload(value)) {
    throw new InvalidStatementImportCursorError('invalid_format');
  }

  return value;
}

function isCursorPayload(
  value: unknown,
): value is StatementImportCursorPayload {
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

function isCursorPosition(
  value: unknown,
): value is StatementImportHistoryCursorPosition {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'statementDate') &&
    Object.hasOwn(value, 'statementImportId') &&
    isValidDomainDate(value.statementDate) &&
    typeof value.statementImportId === 'string' &&
    /^[1-9]\d*$/u.test(value.statementImportId)
  );
}

function isNormalizedFilters(
  value: unknown,
): value is NormalizedStatementImportFilters {
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
    (value.fromDate === null ||
      value.toDate === null ||
      value.fromDate <= value.toDate)
  );
}

function isNullableDomainDate(value: unknown): value is string | null {
  return value === null || isValidDomainDate(value);
}

function sameFilters(
  left: NormalizedStatementImportFilters,
  right: NormalizedStatementImportFilters,
): boolean {
  return CURSOR_FILTER_KEYS.every((key) => left[key] === right[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
