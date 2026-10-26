import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { transformAsync } from '@babel/core';
import { build } from 'esbuild';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { createSession } from '../../application/session.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);

test('compiled manual controller retains successive edits and reflects session draft changes', async t => {
  const session = createSession();
  session.observeIdentity('ada');
  session.changeSpace('personal');
  const active = { id: 'personal', status: 'active', accessLevel: 'write' };
  const authorized = { scope: session.capture(), isCurrent: () => session.isCurrent(authorized.scope) };
  const categories = { categories: [{ id: 'food', name: 'Food', isActive: true }], loading: false, error: null, reload() {} };
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('./use-manual-expense.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'compiled-manual-controller', setup(builder) {
      // Match the app's enabled React Compiler: an uncompiled hook misses this bug.
      builder.onLoad({ filter: /use-manual-expense\.ts$/ }, async ({ path }) => {
        const result = await transformAsync(await readFile(path, 'utf8'), {
          filename: path, configFile: false, babelrc: false,
          parserOpts: { plugins: ['typescript'] },
          plugins: [require.resolve('babel-plugin-react-compiler')],
        });
        return { contents: result.code, loader: 'ts' };
      });
      for (const [filter, path] of [
        [/session-runtime$/, 'test:session'],
        [/authorized-client$/, 'test:authorized'],
        [/spaces\/provider$/, 'test:spaces'],
        [/use-space-categories$/, 'test:categories'],
        [/expense-api-client$/, 'test:api'],
        [/browse-state$/, 'test:browse'],
      ]) builder.onResolve({ filter }, () => ({ path, external: true }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', compiled.outputFiles[0].text)(name => {
    if (name === 'test:session') return { session, useSessionSnapshot: () => React.useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot) };
    if (name === 'test:authorized') return { useAuthorizedClient: () => authorized };
    if (name === 'test:spaces') return { useSpaces: () => ({ active }) };
    if (name === 'test:categories') return { useSpaceCategories: () => categories };
    if (name === 'test:api') return { createExpenseApiClient: () => ({ createManualExpense: async () => {} }) };
    if (name === 'test:browse') return { noteManualExpenseSaved() {} };
    return require(name);
  }, module);
  let controller;
  function Form() { controller = module.exports.useManualExpense(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Form)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  for (const amount of ['1', '12', '123', '123.45']) {
    await act(async () => controller.update({ amount }));
    assert.equal(controller.state.draft.amount, amount);
  }
  for (const description of ['L', 'Lu', 'Lunch']) {
    await act(async () => controller.update({ description }));
    assert.equal(controller.state.draft.description, description);
    assert.equal(controller.state.draft.amount, '123.45');
  }
  await act(async () => controller.update({ categoryId: 'food', expenseDate: '2026-10-25' }));
  assert.equal(controller.state.selectedCategoryName, 'Food');
  assert.equal(controller.state.draft.expenseDate, '2026-10-25');
  await act(async () => session.saveDraft(null));
  assert.equal(controller.state.draft.amount, '');
  assert.equal(controller.state.draft.description, '');
});
