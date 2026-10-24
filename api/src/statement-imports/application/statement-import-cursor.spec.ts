import {
  decodeStatementImportCursor,
  encodeStatementImportCursor,
  normalizeStatementImportFilters,
} from './statement-import-cursor';
import { ApplicationError } from '../../errors/application-error';
import type { StatementImportHistoryFilters } from './statement-import-store';

describe('Statement Import cursors', () => {
  it('round-trips the confirmation-time position and date filters', () => {
    const filters: StatementImportHistoryFilters = {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    };
    const position = {
      confirmedAt: '2026-08-29T00:00:00.000Z',
      statementImportId: '100',
    };
    const cursor = encodeStatementImportCursor(position, filters);
    expect(decodeStatementImportCursor(cursor, filters)).toEqual({
      position,
      filters: normalizeStatementImportFilters(filters),
      ordering: 'confirmedAt:desc,id:desc',
    });
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'pageSize',
    );
  });

  it('normalizes empty filters and rejects invalid cursors', () => {
    const cursor = encodeStatementImportCursor(
      { confirmedAt: '2026-08-29T00:00:00.000Z', statementImportId: '100' },
      {},
    );
    expect(decodeStatementImportCursor(cursor, {}).filters).toEqual(
      normalizeStatementImportFilters({}),
    );
    expect(() => decodeStatementImportCursor('not-a-cursor', {})).toThrow(
      ApplicationError,
    );
  });

  it('rejects a cursor bound to different date filters', () => {
    const cursor = encodeStatementImportCursor(
      { confirmedAt: '2026-08-29T00:00:00.000Z', statementImportId: '100' },
      { fromDate: '2026-08-01' },
    );
    expect(() =>
      decodeStatementImportCursor(cursor, { fromDate: '2026-08-02' }),
    ).toThrow(ApplicationError);
  });
});
