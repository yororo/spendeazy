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
    spaceName: 'Personal', activity: [], canEdit: false, deleting: false, deleteError: null,
    editor: { open: false, phase: 'ready', draft: null, issues: {}, error: null, needsReview: false, latest: null, categories: [], canSave: false },
    expense: {
      id: '1', statementImportId: null, sourceRowId: null, deletedAt: null,
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

test('detail exposes retained provenance and the current Activity actor and labels', () => {
  const view = render({
    expense: { id: '2', description: 'Train', amount: '84.00', expenseDate: '2026-10-23', categoryName: 'Transit', source: 'imported', addedByName: 'Ada', statementImportId: '18', sourceRowId: 'row-9', deletedAt: '2026-10-24T03:00:00.000Z' },
    activity: [{ id: '4', type: 'edited', actorName: 'Grace', occurredAt: '2026-10-24T03:00:00.000Z', before: { categoryId: '1', expenseDate: '2026-10-22', description: 'Ride', amount: '30.00', categoryName: 'Old Transit' }, after: { categoryId: '2', expenseDate: '2026-10-23', description: 'Train', amount: '84.00', categoryName: 'Transit' } }],
  });
  assert.match(view.text, /Statement Import 18/);
  assert.match(view.text, /Source row row-9/);
  assert.match(view.text, /Deleted 2026-10-24/);
  assert.match(view.text, /Expense corrected · Grace/);
  assert.match(view.text, /Old Transit/);
  assert.match(view.text, /Transit/);
});
