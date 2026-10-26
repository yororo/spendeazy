import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadNativeView } from '../../../scripts/native-view-test.mjs';

const { hosts, View: BudgetListView } = await loadNativeView(
  new URL('./budget-list-view.tsx', import.meta.url),
  'BudgetListView',
);

const categories = [
  {
    id: '1', name: 'Food', isActive: true, iconKey: 'shopping-basket', colorKey: 'emerald', revision: '1',
    budget: { amount: '500.00', currency: 'PHP', recurrence: 'monthly' },
  },
  {
    id: '2', name: 'Travel', isActive: true, iconKey: 'plane', colorKey: 'azure', revision: '1',
    budget: { amount: '2400.00', currency: 'PHP', recurrence: 'yearly' },
  },
  {
    id: '3', name: 'Unbudgeted', isActive: true, iconKey: 'shapes', colorKey: 'slate', revision: '1', budget: null,
  },
  {
    id: '4', name: 'Retired', isActive: false, iconKey: 'shapes', colorKey: 'slate', revision: '1',
    budget: { amount: '1200.00', currency: 'PHP', recurrence: 'yearly' },
  },
];

function render(patch = {}) {
  hosts.length = 0;
  const intents = [];
  const props = {
    categories,
    loading: false,
    error: null,
    canEdit: true,
    spaceStatus: null,
    onRetry: () => intents.push('retry'),
    onCreate: () => intents.push('create'),
    onOpen: (id) => intents.push(id),
    ...patch,
  };
  const text = renderToStaticMarkup(React.createElement(BudgetListView, props));
  return {
    text,
    intents,
    find: (label) => hosts.find((host) => host.accessibilityLabel === label),
  };
}

test('Budget view shows all active plan totals independently from inactive and unbudgeted Categories', () => {
  const view = render();
  assert.match(view.text, /Monthly-equivalent plan/);
  assert.match(view.text, /₱700\.00/);
  assert.match(view.text, /Annual equivalent ₱8,400\.00/);
  assert.match(view.text, /2 active Budgets/);
  assert.match(view.text, /₱2,400\.00 per year/);
  assert.match(view.text, /Monthly equivalent ₱200\.00 · Annual equivalent ₱2,400\.00/);
  assert.match(view.text, /No Budget set/);
  assert.doesNotMatch(view.text, /Retired/);

  const summary = view.find('Monthly-equivalent plan ₱700.00; annual equivalent ₱8,400.00; 2 active Budgets');
  assert.equal(summary.glassEffectStyle, 'regular');
  assert.equal(summary.colorScheme, 'light');
  assert.equal(summary.style.gap, 14);
  assert.equal(summary.style.padding, 22);

  const row = view.find('Edit Food, active, Budget ₱500.00 per month; monthly equivalent ₱500.00; annual equivalent ₱6,000.00');
  assert.equal(row.accessibilityRole, 'button');
  row.onPress();
  assert.match(view.text, /Set budget/);
  assert.ok(view.find('Set Budget for Unbudgeted, active, No Budget set'));
  view.find('Create Category').onPress();
  assert.deepEqual(view.intents, ['1', 'create']);
});

test('Budget view exposes search, filters, sorting, and the separate inactive view accessibly', () => {
  const view = render();
  assert.match(view.text, /Amount sorts compare exact monthly equivalents/);
  assert.ok(view.find('Search Categories'));
  for (const label of ['Active', 'Inactive', 'All', 'Monthly', 'Yearly', 'Unset', 'Name', 'Amount', 'Sort order: A–Z']) {
    assert.ok(view.find(label), `${label} control should be accessible`);
  }
  assert.equal(view.find('Monthly').accessibilityState.selected, false);
  assert.equal(view.find('All').accessibilityState.selected, true);
  assert.equal(view.find('Sort order: A–Z').accessibilityHint, 'Double tap to reverse the sort order');
});

test('Budget view renders distinct empty, loading, and retryable error states', () => {
  assert.match(render({ categories: [] }).text, /No Categories yet/);
  const loading = render({ categories: [], loading: true });
  assert.match(loading.text, /Loading Categories and Budgets/);
  assert.match(loading.text, /Loading…/);

  const failed = render({ categories: [], error: 'Could not reach Spendeazy.' });
  assert.match(failed.text, /Could not reach Spendeazy/);
  assert.match(failed.text, /Unavailable/);
  failed.find('Try again').onPress();
  assert.deepEqual(failed.intents, ['retry']);
});
