import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyExpensePage,
  clearExpenseBrowse,
  emptyExpenseBrowse,
  ensureExpenseBrowse,
  expenseBrowseIssues,
  expenseListQuery,
  noteManualExpenseSaved,
  readExpenseBrowse,
  readExpenseListRevision,
  readExpenseScroll,
  rememberExpenseScroll,
  updateExpenseBrowse,
  type ExpensePagePayload,
} from './browse-state.ts';

const page = (
  expenses: ExpensePagePayload['expenses'],
  totals: { totalCount: string; totalAmount: string },
  nextCursor: string | null,
): ExpensePagePayload => ({
  expenses,
  nextCursor,
  ...totals,
});

test('a date and Category selection asks for one page without summing later pages', () => {
  const selection = {
    ...emptyExpenseBrowse('10'),
    fromDate: '2026-03-15',
    toDate: '2026-05-10',
    categoryId: '42',
    description: ' Market ',
    sort: 'oldest' as const,
  };

  assert.deepEqual(expenseBrowseIssues(selection), []);
  assert.deepEqual(expenseListQuery(selection), {
    fromDate: '2026-03-15',
    toDate: '2026-05-10',
    categoryId: '42',
    description: 'Market',
    sort: 'oldest',
    pageSize: 20,
  });
  assert.deepEqual(expenseListQuery(selection, 'cursor-1'), {
    ...expenseListQuery(selection),
    cursor: 'cursor-1',
  });
});

test('every loaded page keeps the full-selection count and amount', () => {
  const first = applyExpensePage(
    null,
    page([{ id: '1', categoryId: '42', expenseDate: '2026-03-15', description: 'Market', amount: '10.00', source: 'manual', addedByUserId: '8', createdAt: '2026-03-15T00:00:00.000Z', updatedAt: '2026-03-15T00:00:00.000Z', revision: '1' }], {
      totalCount: '4',
      totalAmount: '135.25',
    }, 'cursor-1'),
  );
  const second = applyExpensePage(
    first,
    page([{ id: '2', categoryId: '42', expenseDate: '2026-04-01', description: 'Cafe', amount: '20.00', source: 'manual', addedByUserId: '8', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z', revision: '1' }], {
      totalCount: '4',
      totalAmount: '135.25',
    }, null),
  );

  assert.equal(second.totalCount, '4');
  assert.equal(second.totalAmount, '135.25');
  assert.deepEqual(
    second.expenses.map((expense) => expense.id),
    ['1', '2'],
  );
  assert.equal(second.nextCursor, null);
});

test('an incomplete date range is not sent', () => {
  const selection = {
    ...emptyExpenseBrowse('10'),
    fromDate: '2026-05-10',
    toDate: '2026-03-15',
  };

  assert.equal(expenseBrowseIssues(selection).length, 1);
});

test('opening detail keeps filters and scroll, and a Space change clears them', () => {
  clearExpenseBrowse();
  updateExpenseBrowse('10', {
    description: 'cafe',
    sort: 'oldest',
    fromDate: '2026-03-15',
    toDate: '2026-05-10',
    categoryId: '42',
  });
  rememberExpenseScroll(128);
  const revision = readExpenseListRevision();
  noteManualExpenseSaved();

  assert.equal(readExpenseListRevision(), revision + 1);
  assert.equal(readExpenseBrowse('10')?.description, 'cafe');
  assert.equal(readExpenseBrowse('10')?.sort, 'oldest');
  assert.equal(readExpenseScroll(), 128);

  clearExpenseBrowse();

  assert.equal(readExpenseBrowse('10'), null);
  assert.equal(readExpenseScroll(), 0);
  assert.deepEqual(ensureExpenseBrowse('11'), emptyExpenseBrowse('11'));
});
