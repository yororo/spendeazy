import {
  decodeStatementImportCursor,
  encodeStatementImportCursor,
  normalizeStatementImportFilters,
} from './statement-import-cursor';
import { ApplicationError } from '../../errors/application-error';
import type { StatementImportHistoryFilters } from './statement-import-store';

describe('statement import cursors', () => {
  it('round-trips the position and normalized filters without page size', () => {
    const filters: StatementImportHistoryFilters = {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    };

    const cursor = encodeStatementImportCursor(
      { statementDate: '2026-08-15', statementImportId: '100' },
      filters,
    );

    expect(decodeStatementImportCursor(cursor, filters)).toEqual({
      position: { statementDate: '2026-08-15', statementImportId: '100' },
      filters: normalizeStatementImportFilters(filters),
      ordering: 'statementDate:desc,id:desc',
    });
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'pageSize',
    );
  });

  it('normalizes equivalent omitted and explicit empty filters', () => {
    const cursor = encodeStatementImportCursor(
      { statementDate: '2026-08-15', statementImportId: '100' },
      {},
    );

    expect(
      decodeStatementImportCursor(cursor, {
        fromDate: undefined,
        toDate: undefined,
      }).filters,
    ).toEqual(normalizeStatementImportFilters({}));
  });

  it('rejects malformed cursors with a stable validation error', () => {
    const error = captureError(() =>
      decodeStatementImportCursor('not-a-cursor', {}),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    if (error instanceof ApplicationError) {
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual([
        expect.objectContaining({
          field: '/cursor',
          code: 'invalid_format',
        }),
      ]);
    }
  });

  it('rejects a cursor bound to different normalized filters', () => {
    const cursor = encodeStatementImportCursor(
      { statementDate: '2026-08-15', statementImportId: '100' },
      { fromDate: '2026-08-01' },
    );

    const error = captureError(() =>
      decodeStatementImportCursor(cursor, { fromDate: '2026-08-02' }),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    if (error instanceof ApplicationError) {
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual([
        expect.objectContaining({
          field: '/cursor',
          code: 'incompatible',
        }),
      ]);
    }
  });
});

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error: unknown) {
    return error;
  }

  return undefined;
}
