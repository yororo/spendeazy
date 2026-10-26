import { authorizedRequest, type AuthorizedRequestOptions } from './authorized-request.ts';
import { decodeApiResponse } from './request-failure.ts';

export type StatementImportHistoryItem = {
  id: string;
  fileName: string;
  statementDate: string | null;
  provider: string;
  accountFormat: string | null;
  statementType: 'credit_card' | 'e_wallet';
  historyFromDate: string | null;
  historyToDate: string | null;
  totalDebit: string | null;
  importedAt: string;
  importedByUserId: string;
  expenseCount: string;
};

export type StatementImportHistoryPage = { items: StatementImportHistoryItem[]; nextCursor: string | null };

export function createStatementImportHistoryApiClient(options: AuthorizedRequestOptions) {
  return {
    async list(spaceId: string, cursor?: string): Promise<StatementImportHistoryPage> {
      const query = new URLSearchParams({ pageSize: '100' });
      if (cursor) query.set('cursor', cursor);
      const payload = await authorizedRequest<unknown>(options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/statement-imports?${query.toString()}`);
      return decodeApiResponse(() => readPage(payload));
    },
  };
}

function readPage(value: unknown): StatementImportHistoryPage {
  if (!isRecord(value) || !Array.isArray(value.items) || !(value.nextCursor === null || typeof value.nextCursor === 'string')) {
    throw new Error('Invalid Statement Import history page');
  }
  return { items: value.items.map(readItem), nextCursor: value.nextCursor };
}

function readItem(value: unknown): StatementImportHistoryItem {
  if (!isRecord(value) || typeof value.fileName !== 'string' || typeof value.provider !== 'string' ||
      !(value.statementType === 'credit_card' || value.statementType === 'e_wallet') ||
      typeof value.expenseCount !== 'string' || !/^\d+$/u.test(value.expenseCount)) {
    throw new Error('Invalid Statement Import history item');
  }
  return {
    id: readId(value.id),
    fileName: value.fileName,
    statementDate: nullableString(value.statementDate),
    provider: value.provider,
    accountFormat: nullableString(value.accountFormat),
    statementType: value.statementType,
    historyFromDate: nullableString(value.historyFromDate),
    historyToDate: nullableString(value.historyToDate),
    totalDebit: nullableString(value.totalDebit),
    importedAt: readTimestamp(value.importedAt),
    importedByUserId: readId(value.importedByUserId),
    expenseCount: value.expenseCount,
  };
}

function readId(value: unknown): string {
  if (typeof value === 'string' && /^[1-9]\d*$/u.test(value)) return value;
  throw new Error('Invalid identifier');
}

function nullableString(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new Error('Invalid nullable string');
}

function readTimestamp(value: unknown): string {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  throw new Error('Invalid timestamp');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
