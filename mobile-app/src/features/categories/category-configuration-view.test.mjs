import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadNativeView } from '../../../scripts/native-view-test.mjs';

const { hosts, View: CategoryConfigurationForm } = await loadNativeView(
  new URL('./category-configuration-view.tsx', import.meta.url),
  'CategoryConfigurationView',
);

function render() {
  hosts.length = 0;
  const intents = [];
  const state = {
    availability: 'editable', isNew: false, phase: 'ready', saving: false, canSave: true,
    conflict: null, latestConfiguration: null, latestRules: null, checkingLatest: false, error: null, issues: {},
    draft: {
      name: 'Coffee', iconKey: 'coffee', colorKey: 'cocoa', isActive: true,
      budget: { amount: '500.00', currency: 'PHP', recurrence: 'monthly' },
      rules: [{ id: '31', categoryId: '8', pattern: 'Cafe Luna', matchType: 'contains' }],
    },
  };
  const text = renderToStaticMarkup(React.createElement(CategoryConfigurationForm, {
    state,
    onChange: (patch) => intents.push(patch),
    onAddRule: (pattern, matchType) => intents.push({ addRule: pattern, matchType }),
    onRemoveRule: (index) => intents.push({ removeRule: index }),
    onSave: () => intents.push('save'), onRetry: () => intents.push('retry'),
    onContinueWithDraft: () => intents.push('continue-with-draft'),
    onUseLatestConfiguration: () => intents.push('use-latest'), onBack: () => intents.push('back'),
  }));
  return { text, intents, find: (label) => hosts.find((props) => props.accessibilityLabel === label) };
}

test('category form renders a complete draft and emits accessible configuration intents without a backend', () => {
  const view = render();
  assert.match(view.text, /Coffee/);
  assert.match(view.text, /Cafe Luna/);
  assert.equal(view.find('Category name').value, 'Coffee');
  view.find('Category name').onChangeText('Morning Coffee');
  view.find('Category icon plane').onPress();
  view.find('Category color coral').onPress();
  view.find('Monthly').onPress();
  view.find('Remove Rule 1').onPress();
  view.find('Save Category').onPress();
  assert.deepEqual(view.intents, [
    { name: 'Morning Coffee' }, { iconKey: 'plane' }, { colorKey: 'coral' },
    { budget: { amount: '500.00', currency: 'PHP', recurrence: 'monthly' } },
    { removeRule: 0 }, 'save',
  ]);
  assert.equal(view.find('Deactivate Category').accessibilityRole, 'button');
});

test('category form keeps archived configuration read-only and exposes recovery states', () => {
  const readOnly = renderToStaticMarkup(React.createElement(CategoryConfigurationForm, {
    state: {
      availability: 'archived', isNew: false, phase: 'ready', saving: false, canSave: false,
      conflict: null, latestConfiguration: null, latestRules: null, checkingLatest: false, error: null, issues: {},
      draft: {
        name: 'Coffee', iconKey: 'coffee', colorKey: 'cocoa', isActive: true,
        budget: null, rules: [],
      },
    },
    onChange() {}, onAddRule() {}, onRemoveRule() {}, onSave() {}, onRetry() {},
    onContinueWithDraft() {}, onUseLatestConfiguration() {}, onBack() {},
  }));
  assert.match(readOnly, /archived/);
  assert.match(readOnly, /read-only/);
  const failed = renderToStaticMarkup(React.createElement(CategoryConfigurationForm, {
    state: { availability: 'editable', isNew: true, phase: 'error', draft: null, saving: false, canSave: false, conflict: null, latestConfiguration: null, latestRules: null, checkingLatest: false, error: 'Could not reach Spendeazy.', issues: {} },
    onChange() {}, onAddRule() {}, onRemoveRule() {}, onSave() {}, onRetry() {},
    onContinueWithDraft() {}, onUseLatestConfiguration() {}, onBack() {},
  }));
  assert.match(failed, /Could not reach Spendeazy/);
  assert.match(failed, /Try again/);
});

test('category form compares the latest saved configuration before allowing a stale draft to continue', () => {
  hosts.length = 0;
  const intents = [];
  const latestConfiguration = {
    category: { id: '8', name: 'Coffee (latest)', iconKey: 'coffee', colorKey: 'cocoa', isActive: false, revision: '5' },
    budget: null,
    rules: [{ pattern: 'Cafe Luna', matchType: 'contains' }],
    rulesRevision: '13',
  };
  const view = renderToStaticMarkup(React.createElement(CategoryConfigurationForm, {
    state: {
      availability: 'editable', isNew: false, phase: 'ready', saving: false, canSave: false,
      conflict: 'category', latestConfiguration, latestRules: null, checkingLatest: false, error: null, issues: {},
      draft: {
        name: 'Coffee (my draft)', iconKey: 'coffee', colorKey: 'cocoa', isActive: true,
        budget: null, rules: [],
      },
    },
    onChange() {}, onAddRule() {}, onRemoveRule() {}, onSave() {}, onRetry() {},
    onContinueWithDraft: () => intents.push('continue-with-draft'),
    onUseLatestConfiguration() {}, onBack() {},
  }));
  assert.match(view, /Coffee \(latest\)/);
  assert.match(view, /Continue with my draft/);
  const nameField = hosts.find((props) => props.accessibilityLabel === 'Category name');
  assert.equal(nameField.value, 'Coffee (my draft)');
  assert.equal(nameField.editable, false);
  hosts.find((props) => props.accessibilityLabel === 'Continue with my draft').onPress();
  assert.deepEqual(intents, ['continue-with-draft']);
});

test('new Category conflict shows the latest Space Rules before refreshing the draft revision', () => {
  hosts.length = 0;
  const latestRules = {
    revision: '14',
    rules: [{ id: '41', categoryId: '5', pattern: 'Cafe Luna', matchType: 'contains' }],
  };
  const intents = [];
  const view = renderToStaticMarkup(React.createElement(CategoryConfigurationForm, {
    state: {
      availability: 'editable', isNew: true, phase: 'ready', saving: false, canSave: false,
      conflict: 'space-rules', latestConfiguration: null, latestRules, checkingLatest: false,
      error: null, issues: {},
      draft: {
        name: 'New Category', iconKey: 'shapes', colorKey: 'teal', isActive: true,
        budget: null, rules: [{ pattern: 'My pattern', matchType: 'exact' }],
      },
    },
    onChange() {}, onAddRule() {}, onRemoveRule() {}, onSave() {}, onRetry() {},
    onContinueWithDraft: () => intents.push('continue-with-draft'),
    onUseLatestConfiguration() {}, onBack() {},
  }));
  assert.match(view, /latest saved configuration|latest Space Category Rules/i);
  assert.match(view, /Category 5 · contains: Cafe Luna/);
  hosts.find((props) => props.accessibilityLabel === 'Continue with my draft').onPress();
  assert.deepEqual(intents, ['continue-with-draft']);
});
