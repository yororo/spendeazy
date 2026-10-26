import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
let harness;
class StubExpenseApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = [];
  }
}

const compiled = await build({
  stdin: {
    contents: "export { useCategoryConfiguration } from './use-category-configuration';",
    resolveDir: fileURLToPath(new URL('./', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  packages: 'external',
  plugins: [{
    name: 'category-editor-hooks',
    setup(builder) {
      for (const [filter, path] of [
        [/^@\/api\/categories-api-client$/, 'test:categories-api'],
        [/^@\/api\/request-failure$/, 'test:request-failure'],
        [/^@\/application\/authorized-client$/, 'test:authorized-client'],
        [/^@\/application\/spaces\/provider$/, 'test:spaces'],
      ]) {
        builder.onResolve({ filter }, () => ({ path, external: true }));
      }
    },
  }],
});

const compiledModule = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)((name) => {
  if (name === 'test:categories-api') {
    return { createCategoriesApiClient: (authorized) => harness.clients.get(authorized.scope.generation) };
  }
  if (name === 'test:request-failure') {
    return {
      ApiError: StubExpenseApiError,
      requestFailureMessage: (error) => error.message ?? 'Request failed.',
    };
  }
  if (name === 'test:authorized-client') {
    return { useAuthorizedClient: () => harness.authorized };
  }
  if (name === 'test:spaces') {
    return { useSpaces: () => ({ active: harness.active }) };
  }
  return require(name);
}, compiledModule);
const { useCategoryConfiguration } = compiledModule.exports;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function authorization(generation, userId, spaceId) {
  const scope = { generation, userId, spaceId };
  return { scope, current: true, isCurrent() { return this.current; } };
}

function categoryConfiguration(name, id = '8', revision = '4', rulesRevision = '12') {
  return {
    category: {
      id,
      name,
      iconKey: 'coffee',
      colorKey: 'cocoa',
      isActive: true,
      revision,
    },
    budget: null,
    rules: [],
    rulesRevision,
  };
}

async function mount(t, initialHarness, props) {
  harness = initialHarness;
  let value;
  function Consumer({ spaceId, categoryId }) {
    value = useCategoryConfiguration(spaceId, categoryId);
    return null;
  }
  const tree = (nextProps) => React.createElement(Consumer, nextProps);
  let renderer;
  await act(async () => { renderer = create(tree(props)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return {
    get value() { return value; },
    async rerender(nextProps) {
      await act(async () => renderer.update(tree(nextProps)));
    },
  };
}

test('retry reloads a failed configuration and a failed save retains the edited draft', async (t) => {
  let reads = 0;
  const client = {
    async getCategoryConfiguration() {
      reads += 1;
      if (reads === 1) throw new Error('Load failed.');
      return categoryConfiguration('Coffee');
    },
    async saveCategoryConfiguration() { throw new Error('Save failed.'); },
  };
  const authorized = authorization(1, 'ada', 'space-1');
  const app = await mount(t, {
    authorized,
    active: { id: 'space-1', status: 'active', accessLevel: 'write' },
    clients: new Map([[1, client]]),
  }, { spaceId: 'space-1', categoryId: '8' });

  assert.equal(app.value.state.phase, 'error');
  await act(async () => { app.value.retry(); });
  assert.equal(app.value.state.phase, 'ready');
  assert.equal(app.value.state.draft.name, 'Coffee');

  await act(async () => { app.value.update({ name: 'Morning Coffee' }); });
  let saved;
  await act(async () => { saved = await app.value.save(); });
  assert.equal(saved, false);
  assert.equal(app.value.state.draft.name, 'Morning Coffee');
  assert.equal(app.value.state.error, 'Save failed.');
});

test('a response from the previous identity and Space cannot replace the current draft', async (t) => {
  const previousRead = deferred();
  const currentRead = deferred();
  const previousAuth = authorization(1, 'ada', 'space-1');
  const nextAuth = authorization(2, 'bea', 'space-2');
  const previousClient = { getCategoryConfiguration: () => previousRead.promise };
  const currentClient = { getCategoryConfiguration: () => currentRead.promise };
  const initialHarness = {
    authorized: previousAuth,
    active: { id: 'space-1', status: 'active', accessLevel: 'write' },
    clients: new Map([[1, previousClient], [2, currentClient]]),
  };
  const app = await mount(t, initialHarness, { spaceId: 'space-1', categoryId: '8' });

  previousAuth.current = false;
  harness.authorized = nextAuth;
  harness.active = { id: 'space-2', status: 'active', accessLevel: 'write' };
  await app.rerender({ spaceId: 'space-2', categoryId: '8' });

  await act(async () => { currentRead.resolve(categoryConfiguration('Bea Category')); });
  assert.equal(app.value.state.draft.name, 'Bea Category');
  await act(async () => { previousRead.resolve(categoryConfiguration('Ada Private Category')); });
  assert.equal(app.value.state.draft.name, 'Bea Category');
  assert.equal(app.value.state.availability, 'editable');
});

test('a stale save shows the latest configuration and allows an explicit draft retry with fresh revisions', async (t) => {
  let reads = 0;
  const saveRequests = [];
  const client = {
    async getCategoryConfiguration() {
      reads += 1;
      return reads === 1
        ? categoryConfiguration('Coffee')
        : categoryConfiguration('Coffee (latest)', '8', '5', '13');
    },
    async saveCategoryConfiguration(_spaceId, _categoryId, draft) {
      saveRequests.push(draft);
      if (saveRequests.length === 1) {
        throw new StubExpenseApiError(409, 'STALE_EDIT', 'This Category changed elsewhere.');
      }
      return categoryConfiguration('Morning Coffee', '8', '6', '13');
    },
  };
  const app = await mount(t, {
    authorized: authorization(1, 'ada', 'space-1'),
    active: { id: 'space-1', status: 'active', accessLevel: 'write' },
    clients: new Map([[1, client]]),
  }, { spaceId: 'space-1', categoryId: '8' });

  await act(async () => { app.value.update({ name: 'Morning Coffee' }); });
  let firstSave;
  await act(async () => { firstSave = await app.value.save(); });
  assert.equal(firstSave, false);
  assert.equal(app.value.state.conflict, 'category');
  assert.equal(app.value.state.draft.name, 'Morning Coffee');
  assert.equal(app.value.state.latestConfiguration.category.name, 'Coffee (latest)');
  assert.equal(app.value.state.canSave, false);

  await act(async () => { app.value.continueWithDraft(); });
  assert.equal(app.value.state.conflict, null);
  assert.equal(app.value.state.draft.name, 'Morning Coffee');
  assert.equal(app.value.state.canSave, true);
  let secondSave;
  await act(async () => { secondSave = await app.value.save(); });
  assert.equal(secondSave, true);
  assert.equal(saveRequests[1].expectedRevision, '5');
  assert.equal(saveRequests[1].expectedRulesRevision, '13');
});

test('a stale new Category save shows current Space Rules and retries with their latest revision', async (t) => {
  const createRequests = [];
  const latestRules = {
    revision: '13',
    rules: [{ id: '31', categoryId: '5', pattern: 'Cafe Luna', matchType: 'contains' }],
  };
  const client = {
    async getRulesRevision() { return '12'; },
    async getCategoryRules() { return latestRules; },
    async createCategoryConfiguration(_spaceId, draft) {
      createRequests.push(draft);
      if (createRequests.length === 1) {
        throw new StubExpenseApiError(409, 'STALE_EDIT', 'Space Category Rules changed elsewhere.');
      }
      return categoryConfiguration('Concerts');
    },
  };
  const app = await mount(t, {
    authorized: authorization(1, 'ada', 'space-1'),
    active: { id: 'space-1', status: 'active', accessLevel: 'write' },
    clients: new Map([[1, client]]),
  }, { spaceId: 'space-1', categoryId: null });

  await act(async () => {
    app.value.update({
      name: 'Concerts',
      rules: [{ pattern: 'My new matching rule', matchType: 'exact' }],
    });
  });
  let firstSave;
  await act(async () => { firstSave = await app.value.save(); });
  assert.equal(firstSave, false);
  assert.equal(app.value.state.conflict, 'space-rules');
  assert.equal(app.value.state.draft.name, 'Concerts');
  assert.deepEqual(app.value.state.latestRules, latestRules);
  assert.equal(app.value.state.canSave, false);

  await act(async () => { app.value.continueWithDraft(); });
  assert.equal(app.value.state.conflict, null);
  assert.equal(app.value.state.draft.name, 'Concerts');
  assert.equal(app.value.state.canSave, true);
  let secondSave;
  await act(async () => { secondSave = await app.value.save(); });
  assert.equal(secondSave, true);
  assert.equal(createRequests[1].expectedRevision, null);
  assert.equal(createRequests[1].expectedRulesRevision, '13');
});

test('a second save is rejected while the first save is still pending', async (t) => {
  const saveRequest = deferred();
  const client = {
    async getCategoryConfiguration() { return categoryConfiguration('Coffee'); },
    saveCategoryConfiguration() { return saveRequest.promise; },
  };
  const app = await mount(t, {
    authorized: authorization(1, 'ada', 'space-1'),
    active: { id: 'space-1', status: 'active', accessLevel: 'write' },
    clients: new Map([[1, client]]),
  }, { spaceId: 'space-1', categoryId: '8' });

  await act(async () => { app.value.update({ name: 'Coffee Shops' }); });
  let firstSave;
  await act(async () => {
    firstSave = app.value.save();
    await Promise.resolve();
  });
  assert.equal(app.value.state.saving, true);
  assert.equal(await app.value.save(), false);

  await act(async () => {
    saveRequest.resolve(categoryConfiguration('Coffee Shops'));
    await firstSave;
  });
  assert.equal(app.value.state.saving, false);
  assert.equal(app.value.state.draft.name, 'Coffee Shops');
});
