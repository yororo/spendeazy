import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// A native host substitute, not a browser target. Render real feature/primitives
// with supplied state, recording native props to exercise accessible user intents.
const hosts = [];
function host(name) {
  return function NativeTestHost(props) {
    hosts.push({ name, ...props });
    if (name === 'Modal' && !props.visible) return null;
    if (name === 'FlatList') return React.createElement(React.Fragment, null,
      props.refreshControl, props.ListHeaderComponent,
      props.data.length ? props.data.map(item => React.createElement(React.Fragment, { key: item.id }, props.renderItem({ item }))) : props.ListEmptyComponent,
      props.ListFooterComponent);
    return React.createElement(React.Fragment, null, props.children);
  };
}
const native = Object.fromEntries(['FlatList', 'KeyboardAvoidingView', 'Pressable', 'RefreshControl', 'Text', 'View', 'Modal', 'TextInput', 'ScrollView'].map(name => [name, host(name)]));
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('./manual-view.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  packages: 'external',
  plugins: [{ name: 'native-test-context', setup(builder) {
    builder.onResolve({ filter: /app-theme$/ }, () => ({ path: 'theme', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `import {palette, fontFamily} from '@/constants/theme'; export const useAppTheme = () => ({palette: palette.light, fonts: fontFamily});`, resolveDir: fileURLToPath(new URL('../../../', import.meta.url)) }));
  } }],
});
const require = createRequire(import.meta.url);
const compiledModule = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)(name => {
  if (name === 'react-native') return native;
  if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
  return require(name);
}, compiledModule);
const { ManualExpenseForm } = compiledModule.exports;


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
