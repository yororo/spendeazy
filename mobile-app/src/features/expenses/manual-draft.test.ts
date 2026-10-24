import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultManualExpenseDraft,
  manualExpenseRequest,
  todayInManila,
  validateManualExpenseDraft,
} from './manual-draft.ts';

const TODAY = '2026-10-24';

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

  assert.deepEqual(validateManualExpenseDraft(draft, TODAY), []);
  assert.deepEqual(manualExpenseRequest(draft), {
    amount: '12.50',
    description: 'Market run',
    categoryId: '42',
    expenseDate: TODAY,
  });
});

test('create rejects a blank description, missing Category, inexact amount and future Manila date', () => {
  const issues = validateManualExpenseDraft(
    {
      amount: '0.00',
      description: '   ',
      categoryId: null,
      expenseDate: '2026-10-25',
    },
    TODAY,
  );

  assert.deepEqual(
    issues.map((issue) => issue.field),
    ['amount', 'description', 'categoryId', 'expenseDate'],
  );
});

test('create rejects an invalid calendar date and more than two decimal places', () => {
  const issues = validateManualExpenseDraft(
    {
      amount: '4.555',
      description: 'Coffee',
      categoryId: '42',
      expenseDate: '2026-02-31',
    },
    TODAY,
  );

  assert.deepEqual(
    issues.map((issue) => issue.field),
    ['amount', 'expenseDate'],
  );
});
