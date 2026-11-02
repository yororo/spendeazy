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
  plugins: [{ name: 'boundaries', setup(builder) { builder.onResolve({ filter: /^@\/|^\.\/provider-identity$/ }, ({ path }) => ({ path, external: true })); } }],
});
let hardwareBack;
const button = ({ label, ...props }) => React.createElement('Action', { ...props, label });
const module = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)(name => {
  if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'ios' }, AccessibilityInfo: { announceForAccessibility() {} }, BackHandler: { addEventListener: (_, callback) => { hardwareBack = callback; return { remove() {} }; } } };
  if (name === 'lucide-react-native') return Object.fromEntries(['CircleCheck', 'CircleHelp', 'CircleX', 'LoaderCircle', 'X'].map(icon => [icon, icon]));
  if (name === '@/navigation/app-theme') return { useAppTheme: () => ({ palette: {}, fonts: {} }) };
  if (name === '@/constants/theme') return { controlSize: { minimumTarget: 48 }, space: { sheetGap: 20 } };
  if (name === '@/navigation/money-amount') return { displayMoneyAmount: amount => amount.replace(/\B(?=(\d{3})+(?!\d))/g, ',') };
  if (name === './provider-identity') return { ProviderIdentity: 'ProviderIdentity' };
  if (name === '@/components/buttons') return { PrimaryButton: button, SecondaryButton: button, CompactAction: button };
  if (name === '@/components/choice-sheet') return { CenteredDialog: ({ visible, children, ...props }) => React.createElement('Dialog', { visible, ...props }, visible ? children : null) };
  if (name === '@/components/screen') return { Screen: ({ headerAccessory, children }) => React.createElement('Screen', {}, headerAccessory, children), SupportingText: 'SupportingText' };
  if (name === '@/components/design-surface') return { DesignSurface: 'Surface' };
  if (name === '@/components/space-status') return { SpaceStatus: 'SpaceStatus' };
  return require(name);
}, module);
const { ImportRecoveryView } = module.exports;

test('unresolved Close and Android Back warn; backdrop keeps recovery; explicit dismissal never acknowledges', async () => {
  let closed = 0; let acknowledged = 0; let checked = 0;
  const controller = { phase: 'uncertain', receipt: { spaceId: '7' }, canRetry: true, checkStatus: () => { checked++; }, acknowledge: async () => { acknowledged++; return true; } };
  let tree;
  await act(async () => { tree = create(React.createElement(ImportRecoveryView, { controller, destination: 'Archived Shared', writable: false, onClose: () => { closed++; } })); });
  const action = label => tree.root.findAllByType('Action').find(n => n.props.label === label);
  assert.equal(action('Retry'), undefined);
  await act(async () => action('Check status').props.onPress()); assert.equal(checked, 1);
  await act(async () => tree.root.findByType('Pressable').props.onPress()); assert.equal(closed, 0);
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
    const action = tree.root.findAllByType('Action').find(n => n.props.label === (phase === 'committed' ? 'Done' : 'New review'));
    assert.equal(tree.root.findAllByType('Action').some(n => n.props.label === 'Check status'), false);
    await act(async () => action.props.onPress()); assert.equal(navigated, 0);
    cleared = true; await act(async () => action.props.onPress()); assert.equal(navigated, 1);
    await act(async () => tree.unmount());
  }
});

test('recovered provider identity and History acknowledgment do not require a living review', async () => {
  const account = { provider: 'gcash', format: 'e-wallet', statementType: 'e-wallet' };
  let cleared = false; let history = 0;
  const controller = { phase: 'committed', receipt: { spaceId: '7', account }, handoff: null,
    result: { originalExpenseCount: '4', originalExpenseTotal: '1032.00' }, acknowledge: async () => cleared };
  let tree;
  await act(async () => { tree = create(React.createElement(ImportRecoveryView, { controller, destination: 'Personal', historyAvailable: true,
    onClose() {}, onAcknowledged() {}, onHistory: () => { history++; } })); });
  assert.deepEqual(tree.root.findByType('ProviderIdentity').props.account, account);
  assert.equal(tree.root.findByType('ProviderIdentity').props.showName, false);
  const text = tree.root.findAllByType('Text').map(n => n.props.children);
  assert.ok(text.includes('PHP 1,032.00'));
  assert.ok(text.includes('4 Expenses'));
  assert.equal(tree.root.findByType('SpaceStatus').props.spaceId, '7');
  assert.equal(tree.root.findByType('SpaceStatus').props.readOnly, true);
  assert.equal(text.includes('Personal'), false);
  assert.equal(tree.root.findByType('Pressable').props.accessibilityLabel, 'Close import');
  const action = tree.root.findAllByType('Action').find(n => n.props.label === 'History');
  assert.equal(action.props.variant, 'quiet');
  await act(async () => action.props.onPress()); assert.equal(history, 0);
  cleared = true;
  await act(async () => action.props.onPress()); assert.equal(history, 1);
  await act(async () => tree.unmount());
});
