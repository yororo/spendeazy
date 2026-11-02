import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { transformAsync } from '@babel/core';
import { build } from 'esbuild';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { confirmationHandoff } from './confirmation.fixture.ts';
import { createConfirmationWorkflow } from './confirmation-workflow.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
let harness;
const operationId = '11111111-1111-4111-8111-111111111111';
const result = { status: 'committed', operationId, statementImportId: '12', confirmedAt: '2026-10-30T00:00:00.000Z', originalExpenseCount: '2', originalExpenseTotal: '1300.00' };
const compiled = await build({
  stdin: {
    contents: "export { useImportConfirmation } from './use-import-confirmation.ts'; export { useStatementImport } from './use-statement-import.ts';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'compiled-import-controller', setup(builder) {
    builder.onLoad({ filter: /use-(import-confirmation|statement-import)\.ts$/ }, async ({ path }) => {
      const transformed = await transformAsync(await readFile(path, 'utf8'), {
        filename: path, configFile: false, babelrc: false,
        parserOpts: { plugins: ['typescript'] },
        plugins: [require.resolve('babel-plugin-react-compiler')],
      });
      return { contents: transformed.code, loader: 'ts' };
    });
    builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path, external: true }));
    builder.onResolve({ filter: /^expo-crypto$/ }, ({ path }) => ({ path, external: true }));
    builder.onResolve({ filter: /^\.\/import-runtime$/ }, ({ path }) => ({ path, external: true }));
  } }],
});
const module = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)(name => {
  if (name === 'expo-crypto') return { randomUUID: () => operationId };
  if (name === '@/application/authorized-client') return { useAuthorizedClient: () => harness.authorized };
  if (name === '@/application/spaces/provider') return { useSpaces: () => harness.spaces };
  if (name === '@/application/spaces/active-space') return { spaceIdentityLabel: () => 'Personal' };
  if (name === './import-runtime') return { importWorkflow: {
    snapshot: () => harness.runtime, subscribe: () => () => {},
  } };
  if (name === '@/api/statement-import-confirmation-api-client') return { createStatementImportConfirmationApiClient: () => harness.api };
  if (name === '@/application/session-runtime') return {
    session: { get confirmation() { return harness.workflow; }, snapshot: () => harness.scope, subscribe: () => () => {} },
    statementImportStore: {
      snapshot: () => harness.store.snapshot(),
      subscribe: listener => harness.store.subscribe(listener),
    },
    confirmationReceipts: { write: receipt => harness.write(receipt) },
  };
  return require(name);
}, module);

async function mount(t, loseResponse = false, alreadyCommitted = false) {
  const handoff = confirmationHandoff();
  let draft = { phase: 'review-ready', review: { handoff } };
  const listeners = new Set();
  const access = { ...handoff.owner, ownerUserId: handoff.owner.userId, authenticated: true, writable: true, generation: 1 };
  harness = {
    spaces: { loading: false, error: null, active: { accessLevel: 'write', status: 'active' } },
    scope: { spaceWritable: true }, runtime: { cleanup: 'ready' },
    authorized: {}, write: async () => {}, calls: [],
    store: { snapshot: () => draft, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
    api: {
      preview: async () => ({ warnings: [], warningDigest: 'a'.repeat(64) }),
      status: async () => ({ status: 'pending', operationId }),
      confirm: async (_spaceId, id, json) => {
        harness.calls.push({ id, json });
        if (loseResponse) { loseResponse = false; throw Error('Response lost'); }
        return result;
      },
    },
  };
  harness.workflow = createConfirmationWorkflow({
    access: () => access, handoff: () => draft.phase === 'review-ready' ? handoff : null,
    lock() {}, refresh() {}, complete() {
      draft = { phase: 'idle' };
      harness.workflow.synchronize();
      for (const listener of listeners) listener();
    },
  });
  if (alreadyCommitted) {
    await harness.workflow.preview(harness.api);
    await harness.workflow.submit(harness.api, () => operationId, harness.write);
  }
  let controller;
  let selection;
  function Screen() {
    selection = module.exports.useStatementImport();
    controller = module.exports.useImportConfirmation(harness.write);
    return React.createElement('Screen', { mode: controller.receipt ? 'result' : controller.handoff ? 'confirmation' : 'selection' });
  }
  let tree;
  await act(async () => { tree = create(React.createElement(Screen)); });
  t.after(async () => { await act(async () => tree.unmount()); });
  return { get controller() { return controller; }, get selection() { return selection; }, mode: () => tree.root.findByType('Screen').props.mode };
}

test('compiled confirmation shows success after review cleanup and exits recovery on Done without remounting', async t => {
  const screen = await mount(t);
  assert.equal(screen.controller.phase, 'ready');
  assert.equal(screen.controller.receipt, null);
  await act(async () => screen.controller.submit());
  assert.equal(screen.controller.phase, 'committed');
  assert.equal(screen.controller.receipt?.operationId, operationId);
  assert.equal(screen.controller.handoff, null);
  assert.equal(screen.mode(), 'result');
  assert.deepEqual(screen.controller.result, result);
  assert.equal(screen.selection.canSelect, false);
  await act(async () => { assert.equal(await screen.controller.acknowledge(), true); });
  assert.equal(screen.controller.receipt, null);
  assert.equal(screen.controller.canRetry, false);
  assert.equal(screen.mode(), 'selection');
  assert.equal(screen.selection.canSelect, true);
});

test('compiled confirmation exposes live retry and clears it after the same operation succeeds', async t => {
  const screen = await mount(t, true);
  assert.equal(screen.controller.canRetry, false);
  await act(async () => screen.controller.submit());
  assert.equal(screen.controller.phase, 'uncertain');
  assert.equal(screen.controller.canRetry, true);
  assert.equal(screen.controller.receipt?.operationId, operationId);
  await act(async () => screen.controller.submit());
  assert.equal(screen.controller.phase, 'committed');
  assert.equal(screen.controller.canRetry, false);
  assert.deepEqual(harness.calls[0], harness.calls[1]);
});

test('compiled reopened success screen clears its initially present receipt on Done', async t => {
  const screen = await mount(t, false, true);
  assert.equal(screen.controller.phase, 'committed');
  assert.equal(screen.mode(), 'result');
  assert.equal(screen.selection.canSelect, false);
  await act(async () => { assert.equal(await screen.controller.acknowledge(), true); });
  assert.equal(screen.controller.receipt, null);
  assert.equal(screen.mode(), 'selection');
  assert.equal(screen.selection.canSelect, true);
});
