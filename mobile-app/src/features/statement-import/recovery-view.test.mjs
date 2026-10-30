import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { build } from 'esbuild';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: [fileURLToPath(new URL('./recovery-view.tsx', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'boundaries', setup(builder) { builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path, external: true })); } }],
});
let hardwareBack;
const button = ({ label, ...props }) => React.createElement('Action', { ...props, label });
const module = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)(name => {
  if (name === 'react-native') return { View: 'View', Platform: { OS: 'ios' }, AccessibilityInfo: { announceForAccessibility() {} }, BackHandler: { addEventListener: (_, callback) => { hardwareBack = callback; return { remove() {} }; } } };
  if (name === '@/components/buttons') return { PrimaryButton: button, SecondaryButton: button };
  if (name === '@/components/choice-sheet') return { CenteredDialog: ({ visible, children, ...props }) => React.createElement('Dialog', { visible, ...props }, visible ? children : null) };
  if (name === '@/components/screen') return { Screen: 'Screen', BodyText: 'BodyText', SupportingText: 'SupportingText' };
  if (name === '@/components/design-surface') return { DesignSurface: 'Surface' };
  return require(name);
}, module);
const { ImportRecoveryView } = module.exports;

test('unresolved Close and Android Back warn; backdrop keeps recovery; explicit dismissal never acknowledges', async () => {
  let closed = 0; let acknowledged = 0; let checked = 0;
  const controller = { phase: 'uncertain', receipt: { spaceId: '7' }, canRetry: true, checkStatus: () => { checked++; }, acknowledge: async () => { acknowledged++; return true; } };
  let tree;
  await act(async () => { tree = create(React.createElement(ImportRecoveryView, { controller, destination: 'Archived Shared', writable: false, onClose: () => { closed++; } })); });
  const action = label => tree.root.findAllByType('Action').find(n => n.props.label === label);
  assert.equal(action('Retry same import'), undefined);
  await act(async () => action('Check status').props.onPress()); assert.equal(checked, 1);
  await act(async () => action('Close').props.onPress()); assert.equal(closed, 0);
  assert.equal(tree.root.findByType('Dialog').props.visible, true);
  await act(async () => tree.root.findByType('Dialog').props.onDismiss()); assert.equal(closed, 0);
  await act(async () => hardwareBack()); assert.equal(tree.root.findByType('Dialog').props.visible, true);
  await act(async () => action('Close message').props.onPress()); assert.equal(closed, 1); assert.equal(acknowledged, 0);
  await act(async () => tree.unmount());
});

test('terminal presentation works without handoff, and navigation waits for receipt deletion', async () => {
  for (const phase of ['committed', 'not_committed']) {
    let cleared = false; let navigated = 0;
    const controller = { phase, receipt: { spaceId: '7' }, result: phase === 'committed' ? { originalExpenseCount: '2', originalExpenseTotal: '1300.00' } : null,
      handoff: null, acknowledge: async () => cleared };
    let tree;
    await act(async () => { tree = create(React.createElement(ImportRecoveryView, { controller, destination: 'Shared', writable: false, historyAvailable: true, onClose() {}, onAcknowledged: () => { navigated++; }, onHistory: () => { navigated++; } })); });
    const action = tree.root.findAllByType('Action').find(n => n.props.label === (phase === 'committed' ? 'Acknowledge import' : 'Start a new review'));
    assert.equal(tree.root.findAllByType('Action').some(n => n.props.label === 'Check status'), false);
    await act(async () => action.props.onPress()); assert.equal(navigated, 0);
    cleared = true; await act(async () => action.props.onPress()); assert.equal(navigated, 1);
    await act(async () => tree.unmount());
  }
});
