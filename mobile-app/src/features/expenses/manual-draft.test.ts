import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultManualExpenseDraft,
  todayInManila,
  prepareManualExpense,
} from './manual-draft.ts';

const TODAY = '2026-10-24';
const context = { now: new Date('2026-10-24T00:00:00Z'), spaceId: 'personal', categories: { spaceId: 'personal', items: [{ id: '42', isActive: true }] } };

test('today in Manila uses the Asia/Manila calendar date', () => {
  assert.equal(todayInManila(new Date('2026-10-23T16:30:00.000Z')), '2026-10-24');
  assert.equal(todayInManila(new Date('2026-10-24T15:30:00.000Z')), '2026-10-24');
});

test('a new manual Expense defaults the date to today and leaves the other fields blank', () => {
  assert.deepEqual(defaultManualExpenseDraft(TODAY), {
    amount: '',
    description: '',
    categoryId: null,
    expenseDate: TODAY,
  });
});

test('a positive exact peso amount, description, active Category and nonfuture date can be saved', () => {
  const draft = {
    amount: '12.5',
    description: '  Market run  ',
    categoryId: '42',
    expenseDate: TODAY,
  };

  assert.deepEqual(prepareManualExpense(draft, context), { ok: true, input: {
    amount: '12.50',
    description: 'Market run',
    categoryId: '42',
    expenseDate: TODAY,
  } });
});

test('create rejects a blank description, missing Category, inexact amount and future Manila date', () => {
  const result = prepareManualExpense(
    {
      amount: '0.00',
      description: '   ',
      categoryId: null,
      expenseDate: '2026-10-25',
    },
    context,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.issues.map((issue) => issue.field),
    ['amount', 'description', 'categoryId', 'expenseDate'],
  );
});

test('create rejects an invalid calendar date and more than two decimal places', () => {
  const result = prepareManualExpense(
    {
      amount: '4.555',
      description: 'Coffee',
      categoryId: '42',
      expenseDate: '2026-02-31',
    },
    context,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.issues.map((issue) => issue.field),
    ['amount', 'expenseDate'],
  );
});

test('preparation rejects inactive Categories and Category data loaded for another Space', () => {
  for (const categories of [
    { spaceId: 'personal', items: [{ id: '42', isActive: false }] },
    { spaceId: 'shared', items: [{ id: '42', isActive: true }] },
  ]) {
    const result = prepareManualExpense({ amount: '1', description: 'Lunch', categoryId: '42', expenseDate: TODAY }, { ...context, categories });
    assert.deepEqual(result, { ok: false, issues: [{ field: 'categoryId', message: 'Choose an active Category.' }] });
  }
});

test('preparation rejects nonexact or nonpositive money without floating point rounding', () => {
  for (const amount of ['-1', '0', '1.001', '1e2', '1,000', 'NaN', '10000000000000']) {
    const result = prepareManualExpense({ amount, description: 'Lunch', categoryId: '42', expenseDate: TODAY }, context);
    assert.equal(result.ok, false, amount);
    if (!result.ok) assert.deepEqual(result.issues.map(issue => issue.field), ['amount']);
  }
});

test('preparation returns normalized input with explicit Manila time and destination Category eligibility', () => {
  assert.deepEqual(prepareManualExpense({ amount: ' 12.5 ', description: ' Lunch ', categoryId: 'food', expenseDate: '2026-10-24' }, {
    now: new Date('2026-10-23T16:01:00Z'), spaceId: 'personal',
    categories: { spaceId: 'personal', items: [{ id: 'food', isActive: true }] },
  }), { ok: true, input: { amount: '12.50', description: 'Lunch', categoryId: 'food', expenseDate: '2026-10-24' } });
});
