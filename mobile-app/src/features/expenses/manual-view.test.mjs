import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadNativeView } from '../../../scripts/native-view-test.mjs';

const { hosts, View: ManualExpenseForm } = await loadNativeView(new URL('./manual-view.tsx', import.meta.url), 'ManualExpenseForm');

function render(patch = {}) {
  hosts.length = 0;
  const intents = [];
  const state = {
    availability: 'editable', draft: { amount: '12', description: 'Lunch', categoryId: 'food', expenseDate: '2026-10-24' },
    issues: {}, saving: false, canSave: true, saveError: null, selectedCategoryName: 'Food',
    categories: { items: [{ id: 'food', name: 'Food' }], loading: false, error: null }, ...patch,
  };
  const text = renderToStaticMarkup(React.createElement(ManualExpenseForm, {
    state, onChange: patch => intents.push(patch), onSave: () => intents.push('save'),
    onRetryCategories: () => intents.push('categories'), onBack: () => intents.push('back'),
  }));
  return { text, intents, find: label => hosts.find(props => props.accessibilityLabel === label) };
}

test('manual form renders supplied values and emits accessible edit and save intents without a session', () => {
  const view = render();
  assert.equal(view.find('Amount').value, '12');
  view.find('Description').onChangeText('Dinner');
  view.find('Date').onChangeText('2026-10-23');
  const save = view.find('Save Expense');
  assert.equal(save.accessibilityRole, 'button');
  save.onPress();
  assert.deepEqual(view.intents, [{ description: 'Dinner' }, { expenseDate: '2026-10-23' }, 'save']);
});

test('manual form renders recovery, field issues and busy accessibility from supplied state', () => {
  const failed = render({ saveError: 'The API response could not be read.', issues: { categoryId: 'Choose an active Category.' }, categories: { items: [], loading: false, error: 'Could not reach Spendeazy.' }, canSave: false });
  assert.match(failed.text, /response could not be read/);
  assert.match(failed.text, /Choose an active Category/);
  assert.ok(hosts.some(props => props.accessibilityLiveRegion === 'polite'));
  failed.find('Retry Categories').onPress();
  assert.deepEqual(failed.intents, ['categories']);
  assert.equal(failed.find('Try again').accessibilityState.disabled, true);
  const busy = render({ saving: true, canSave: false });
  assert.deepEqual(busy.find('Save Expense').accessibilityState, { busy: true, disabled: true });
  assert.match(render({ availability: 'missing-space' }).text, /Choose a Space/);
  const readOnly = render({ availability: 'read-only' });
  assert.match(readOnly.text, /read-only/);
  readOnly.find('Back').onPress();
  assert.deepEqual(readOnly.intents, ['back']);
  assert.match(render({ categories: { items: [], loading: true, error: null } }).text, /Loading Categories/);
  assert.match(render({ categories: { items: [], loading: false, error: null } }).text, /Add a Category/);
});
