import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadNativeView } from '../../../scripts/native-view-test.mjs';

const { hosts, View: ExpenseDetail } = await loadNativeView(new URL('./detail-view.tsx', import.meta.url), 'ExpenseDetail');

function render(patch = {}) {
  hosts.length = 0;
  const intents = [];
  const state = {
    phase: 'ready', error: null,
    expense: {
      description: 'Cafe', amount: '10.00', expenseDate: '2026-10-24', categoryName: 'Food',
      source: 'manual', addedByName: 'Ada',
    },
    ...patch,
  };
  const text = renderToStaticMarkup(React.createElement(ExpenseDetail, {
    state, onRetry: () => intents.push('retry'), onBack: () => intents.push('back'),
  }));
  return { text, intents, find: label => hosts.find(props => props.accessibilityLabel === label) };
}

test('detail renders amount, date, description, Category, Cash, and Added By from supplied state', () => {
  const view = render();
  assert.match(view.text, /Cafe/);
  assert.match(view.text, /10\.00/);
  assert.match(view.text, /2026-10-24/);
  assert.match(view.text, /Food/);
  assert.match(view.text, /Cash/);
  assert.match(view.text, /Added By Ada/);
  assert.equal(view.find('10.00 Philippine pesos').selectable, true);
  const back = view.find('Back');
  assert.equal(back.accessibilityRole, 'button');
  back.onPress();
  assert.deepEqual(view.intents, ['back']);
});

test('imported detail keeps Account wording and Added By when the member name is absent', () => {
  const view = render({ expense: {
    description: 'Train', amount: '84.00', expenseDate: '2026-10-23', categoryName: 'Category',
    source: 'imported', addedByName: null,
  } });
  assert.match(view.text, /Imported/);
  assert.match(view.text, /Added By is kept with this Expense/);
  assert.equal(view.text.includes('Train'), true);
});

test('detail renders loading, error, and retry from supplied state without a session', () => {
  assert.match(render({ phase: 'loading', expense: null }).text, /Loading Expense/);
  const failed = render({ phase: 'error', error: 'The API response could not be read. Try again.', expense: null });
  assert.match(failed.text, /could not be read/);
  assert.ok(hosts.some(props => props.accessibilityLiveRegion === 'polite'));
  const retry = failed.find('Retry');
  assert.equal(retry.accessibilityRole, 'button');
  retry.onPress();
  failed.find('Back').onPress();
  assert.deepEqual(failed.intents, ['retry', 'back']);
});
