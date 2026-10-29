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
const compiled = await build({
  stdin: {
    contents: "export { useDashboardReport } from './use-dashboard-report';",
    resolveDir: fileURLToPath(new URL('./', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [{
    name: 'dashboard-hooks',
    setup(builder) {
      for (const name of [
        '@/api/dashboard-report-api-client',
        '@/application/authorized-client',
        '@/application/session-runtime',
        '@/application/spaces/provider',
        '@/features/expenses/use-space-categories',
      ]) {
        builder.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({ path: name, external: true }));
      }
    },
  }],
});
const compiledModule = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)((name) => {
  switch (name) {
    case '@/api/dashboard-report-api-client':
      return { createDashboardReportApiClient: () => harness.api };
    case '@/application/authorized-client':
      return { useAuthorizedClient: () => harness.authorized };
    case '@/application/session-runtime':
      return { session: { isCurrent: (scope) => scope === harness.authorized.scope } };
    case '@/application/spaces/provider':
      return { useSpaces: () => ({ active: harness.active }) };
    case '@/features/expenses/use-space-categories':
      return { useSpaceCategories: () => ({ categories: [], loading: false }) };
    default:
      return require(name);
  }
}, compiledModule);
const { useDashboardReport } = compiledModule.exports;

test('Category filters update only chart data, retain the report, and survive refresh', async (t) => {
  const requests = [];
  const report = {
    range: { today: '2026-10-29' },
    monthlyExpenses: [{ month: '2026-10' }],
    categoryExpenses: [{ categoryId: '1' }, { categoryId: '2' }],
  };
  harness = {
    active: { id: '10' },
    authorized: { scope: {}, isCurrent: () => true },
    api: { getDashboardReport(spaceId, query) {
      return new Promise((resolve) => requests.push({ spaceId, query, resolve }));
    } },
  };
  let controller;
  function Consumer() {
    controller = useDashboardReport();
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Consumer)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  assert.equal(controller.loading, true);
  await act(async () => requests[0].resolve(report));
  const assertSelection = (ids) => {
    assert.deepEqual(controller.categoryReport.categoryExpenses.map((point) => point.categoryId), ids);
    assert.equal(controller.report, report);
    assert.equal(controller.loading, false);
    assert.equal(controller.refreshing, false);
    assert.equal(requests.length, 1);
  };
  await act(async () => controller.toggleChartCategory('2'));
  assertSelection(['2']);
  await act(async () => controller.toggleChartCategory('1'));
  assertSelection(['1', '2']);
  await act(async () => controller.toggleChartCategory('2'));
  assertSelection(['1']);
  await act(async () => controller.clearChartCategories());
  assertSelection(['1', '2']);
  await act(async () => controller.toggleChartCategory('2'));
  await act(async () => controller.refresh());
  assert.equal(controller.refreshing, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].query.chartCategoryIds, undefined);
  await act(async () => requests[1].resolve(report));
  assert.deepEqual(controller.categoryReport.categoryExpenses, [{ categoryId: '2' }]);

  // Space changes clear the filter and cannot display the previous Space's data.
  harness.active = { id: '11' };
  harness.authorized = { scope: {}, isCurrent: () => true };
  await act(async () => renderer.update(React.createElement(Consumer)));
  assert.equal(controller.report, null);
  assert.equal(controller.categoryReport, null);
  assert.deepEqual(controller.chartCategoryIds, []);
  await act(async () => requests[2].resolve(report));
  assert.equal(controller.categoryReport, report);
});
