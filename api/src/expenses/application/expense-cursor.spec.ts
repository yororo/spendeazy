import {
  decodeExpenseCursor,
  encodeExpenseCursor,
  normalizeExpenseFilters,
} from './expense-cursor';
import { ApplicationError } from '../../errors/application-error';
import type { ExpenseFilters } from './expense-store';

describe('Expense cursors', () => {
  it('round-trips normalized filters, Space, sort and a stable position without page size', () => {
    const filters: ExpenseFilters = {
      fromDate: '2026-08-01',
      categoryId: '42',
      statementImportId: '9',
      source: 'imported',
      description: 'coffee',
      sort: 'oldest',
    };
    const cursor = encodeExpenseCursor(
      { expenseDate: '2026-08-15', expenseId: '100' },
      filters,
      '7',
    );
    expect(decodeExpenseCursor(cursor, filters, '7')).toEqual({
      position: { expenseDate: '2026-08-15', expenseId: '100' },
      filters: normalizeExpenseFilters(filters),
      spaceId: '7',
      deletedOnly: false,
      ordering: 'expenseDate:asc,id:asc',
    });
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain(
      'pageSize',
    );
  });

  it('rejects malformed and selection-incompatible cursors', () => {
    expect(() => decodeExpenseCursor('not-a-cursor', {}, '7')).toThrow(
      ApplicationError,
    );
    const cursor = encodeExpenseCursor(
      { expenseDate: '2026-08-15', expenseId: '100' },
      { fromDate: '2026-08-01' },
      '7',
    );
    expect(() =>
      decodeExpenseCursor(cursor, { fromDate: '2026-08-02' }, '7'),
    ).toThrow(ApplicationError);
    expect(() =>
      decodeExpenseCursor(cursor, { fromDate: '2026-08-01' }, '8'),
    ).toThrow(ApplicationError);
    expect(() =>
      decodeExpenseCursor(
        cursor,
        { fromDate: '2026-08-01', sort: 'oldest' },
        '7',
      ),
    ).toThrow(ApplicationError);
  });

  it('uses deletion timestamps for retained-history cursor positions', () => {
    const filters: ExpenseFilters = { sort: 'oldest' };
    const cursor = encodeExpenseCursor(
      { deletedAt: '2026-09-20T00:00:00.000Z', expenseId: '100' },
      filters,
      '7',
      true,
    );
    expect(decodeExpenseCursor(cursor, filters, '7', true)).toMatchObject({
      position: { deletedAt: '2026-09-20T00:00:00.000Z', expenseId: '100' },
      ordering: 'deletedAt:desc,id:desc',
      deletedOnly: true,
    });
  });
});
