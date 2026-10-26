import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateBudgetPlan,
  formatBudgetDetails,
  selectBudgetCategories,
  type BudgetBrowseCategory,
  type BudgetBrowseOptions,
} from './budget-browse.ts';

function category(
  id: string,
  name: string,
  options: { isActive?: boolean; amount?: string; recurrence?: 'monthly' | 'yearly' } = {},
): BudgetBrowseCategory {
  return {
    id,
    name,
    isActive: options.isActive ?? true,
    budget: options.amount
      ? { amount: options.amount, currency: 'PHP', recurrence: options.recurrence ?? 'monthly' }
      : null,
  };
}

const defaultOptions: BudgetBrowseOptions = {
  view: 'active',
  filter: 'all',
  search: '',
  sort: 'name',
  direction: 'ascending',
};

test('calculates exact monthly and annual equivalents across mixed recurrences', () => {
  const categories = [
    category('1', 'Home', { amount: '1200.00' }),
    category('2', 'Groceries', { amount: '400.00' }),
    category('3', 'Transport', { amount: '200.00' }),
    category('4', 'Travel', { amount: '2400.00', recurrence: 'yearly' }),
    category('5', 'Unbudgeted'),
  ];

  assert.deepEqual(calculateBudgetPlan(categories), {
    monthlyEquivalent: '₱2,000.00',
    annualEquivalent: '₱24,000.00',
    budgetCount: 4,
  });
  assert.deepEqual(formatBudgetDetails(categories[3]!.budget!), {
    originalAmount: '₱2,400.00',
    originalPeriod: 'year',
    monthlyEquivalent: '₱200.00',
    annualEquivalent: '₱2,400.00',
  });
});

test('rounds only the displayed monthly equivalent half up and preserves the annual total', () => {
  const yearlyThousand = category('1', 'Travel', { amount: '1000.00', recurrence: 'yearly' });
  assert.deepEqual(calculateBudgetPlan([yearlyThousand]), {
    monthlyEquivalent: '₱83.33',
    annualEquivalent: '₱1,000.00',
    budgetCount: 1,
  });

  const halfCentPerMonth = category('2', 'Small', { amount: '0.06', recurrence: 'yearly' });
  assert.deepEqual(calculateBudgetPlan([halfCentPerMonth]), {
    monthlyEquivalent: '₱0.01',
    annualEquivalent: '₱0.06',
    budgetCount: 1,
  });
});

test('filters active and inactive Categories while retaining unbudgeted Categories in All and Unset', () => {
  const categories = [
    category('1', 'Monthly', { amount: '300.00' }),
    category('2', 'Yearly', { amount: '1200.00', recurrence: 'yearly' }),
    category('3', 'Unset'),
    category('4', 'Retired', { isActive: false, amount: '600.00' }),
  ];

  assert.deepEqual(selectBudgetCategories(categories, defaultOptions).map(({ id }) => id), ['1', '3', '2']);
  assert.deepEqual(selectBudgetCategories(categories, { ...defaultOptions, filter: 'monthly' }).map(({ id }) => id), ['1']);
  assert.deepEqual(selectBudgetCategories(categories, { ...defaultOptions, filter: 'yearly' }).map(({ id }) => id), ['2']);
  assert.deepEqual(selectBudgetCategories(categories, { ...defaultOptions, filter: 'unset' }).map(({ id }) => id), ['3']);
  assert.deepEqual(selectBudgetCategories(categories, { ...defaultOptions, view: 'inactive' }).map(({ id }) => id), ['4']);
});

test('searches Category names and sorts exact monthly equivalents with unset Categories last in both directions', () => {
  const categories = [
    category('1', 'Cafe', { amount: '1200.00', recurrence: 'yearly' }),
    category('2', 'Groceries', { amount: '100.00' }),
    category('3', 'Travel'),
    category('4', 'Transit', { amount: '2400.00', recurrence: 'yearly' }),
  ];

  const ascending = selectBudgetCategories(categories, {
    ...defaultOptions,
    sort: 'amount',
  });
  assert.deepEqual(ascending.map(({ id }) => id), ['1', '2', '4', '3']);

  const descending = selectBudgetCategories(categories, {
    ...defaultOptions,
    sort: 'amount',
    direction: 'descending',
  });
  assert.deepEqual(descending.map(({ id }) => id), ['4', '1', '2', '3']);

  const matches = selectBudgetCategories(categories, {
    ...defaultOptions,
    search: '  gROCER  ',
  });
  assert.deepEqual(matches.map(({ id }) => id), ['2']);
  assert.deepEqual(
    selectBudgetCategories(categories, { ...defaultOptions, search: '1200' }),
    [],
  );
});

test('breaks amount ties by Category name then numeric ID independent of amount direction', () => {
  const categories = [
    category('10', 'Same', { amount: '100.00' }),
    category('2', 'Same', { amount: '100.00' }),
    category('4', 'Alpha', { amount: '100.00' }),
  ];

  for (const direction of ['ascending', 'descending'] as const) {
    assert.deepEqual(
      selectBudgetCategories(categories, { ...defaultOptions, sort: 'amount', direction }).map(({ id }) => id),
      ['4', '2', '10'],
    );
  }
});

test('sorts names case-insensitively and uses numeric IDs for duplicate-name ties', () => {
  const categories = [
    category('10', 'Same'),
    category('2', 'same'),
    category('4', 'Alpha'),
  ];

  assert.deepEqual(
    selectBudgetCategories(categories, { ...defaultOptions, sort: 'name' }).map(({ id }) => id),
    ['4', '2', '10'],
  );
  assert.deepEqual(
    selectBudgetCategories(categories, { ...defaultOptions, sort: 'name', direction: 'descending' }).map(({ id }) => id),
    ['2', '10', '4'],
  );
});
