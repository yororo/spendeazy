import {
  decodeTransactionCursor,
  encodeTransactionCursor,
  normalizeTransactionFilters,
} from './transaction-cursor';
import { ApplicationError } from '../../errors/application-error';
import type { TransactionFilters } from './transaction-store';

describe('transaction cursors', () => {
  it('round-trips the position and normalized filters without page size', () => {
    const filters: TransactionFilters = {
      fromDate: '2026-08-01',
      categoryId: '42',
      categoryState: 'categorized',
      statementImportId: '9',
      source: 'imported',
      description: 'coffee',
      accountBank: 'BDO',
      accountCardType: 'AMEX',
    };

    const cursor = encodeTransactionCursor(
      { purchaseDate: '2026-08-15', transactionId: '100' },
      filters,
    );

    expect(decodeTransactionCursor(cursor, filters)).toEqual({
      position: { purchaseDate: '2026-08-15', transactionId: '100' },
      filters: normalizeTransactionFilters(filters),
      ordering: 'purchaseDate:desc,id:desc',
    });
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'pageSize',
    );
  });

  it('normalizes equivalent omitted and explicit empty filters', () => {
    const cursor = encodeTransactionCursor(
      { purchaseDate: '2026-08-15', transactionId: '100' },
      {},
    );

    expect(
      decodeTransactionCursor(cursor, {
        fromDate: undefined,
        toDate: undefined,
        categoryId: undefined,
        categoryState: undefined,
        statementImportId: undefined,
        source: undefined,
      }).filters,
    ).toEqual(normalizeTransactionFilters({}));
  });

  it('rejects malformed cursors with a stable validation error', () => {
    const error = captureError(() =>
      decodeTransactionCursor('not-a-cursor', {}),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    if (error instanceof ApplicationError) {
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toHaveLength(1);
      expect(error.details[0].field).toBe('/cursor');
      expect(error.details[0].code).toBe('invalid_format');
    }
  });

  it('rejects a cursor bound to different normalized filters', () => {
    const cursor = encodeTransactionCursor(
      { purchaseDate: '2026-08-15', transactionId: '100' },
      { fromDate: '2026-08-01' },
    );

    const error = captureError(() =>
      decodeTransactionCursor(cursor, { fromDate: '2026-08-02' }),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    if (error instanceof ApplicationError) {
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toHaveLength(1);
      expect(error.details[0].field).toBe('/cursor');
      expect(error.details[0].code).toBe('incompatible');
    }
  });

  it('rejects a cursor when the description or Account changes', () => {
    const cursor = encodeTransactionCursor(
      { purchaseDate: '2026-08-15', transactionId: '100' },
      { description: 'coffee', accountBank: 'BDO', accountCardType: 'AMEX' },
    );
    expect(() =>
      decodeTransactionCursor(cursor, {
        description: 'tea',
        accountBank: 'BDO',
        accountCardType: 'AMEX',
      }),
    ).toThrow(ApplicationError);
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
