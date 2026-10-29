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
        'react-native',
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
    case 'react-native':
      return { AppState: {
        get currentState() { return harness.appState ?? 'active'; },
        addEventListener(_event, listener) {
          harness.onAppState = listener;
          return { remove() { if (harness.onAppState === listener) harness.onAppState = null; } };
        },
      } };
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

function fixture(view = 'monthly', today = '2026-10-29', year = '2026') {
  return {
    range: { view, today, fromDate: view === 'yearly' ? `${year}-01-01` : '2026-05-01', toDate: today },
    monthlyExpenses: [{ month: view === 'yearly' ? `${year}-10` : '2026-10' }],
    categoryExpenses: [{ categoryId: '1' }, { categoryId: '2' }],
  };
}

async function mountController(t) {
  const requests = [];
  harness = {
    active: { id: '10' },
    authorized: { scope: { generation: 1, userId: 'user-a', spaceId: '10' }, isCurrent: () => true },
    api: { getDashboardReport(spaceId, query) {
      return new Promise((resolve) => requests.push({ spaceId, query, resolve }));
    } },
  };
  let controller;
  function Consumer() { controller = useDashboardReport(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Consumer)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return {
    requests,
    get controller() { return controller; },
    rerender: () => act(async () => renderer.update(React.createElement(Consumer))),
    resolve: (report = fixture()) => act(async () => requests.at(-1).resolve(report)),
  };
}

test('Monthly and Yearly remember independent periods and reject invalid or future years', async (t) => {
  const screen = await mountController(t);
  await screen.resolve();
  await act(async () => screen.controller.movePeriod(-1));
  assert.deepEqual(screen.requests.at(-1).query, { view: 'monthly', endMonth: '2026-09' });
  await screen.resolve({ ...fixture(), monthlyExpenses: [{ month: '2026-09' }] });
  await act(async () => screen.controller.selectView('yearly'));
  assert.deepEqual(screen.requests.at(-1).query, { view: 'yearly', year: '2026' });
  await screen.resolve(fixture('yearly'));
  for (const year of ['2027', '0000', '-001', '26', '2025.0']) {
    await act(async () => screen.controller.selectYear(year));
    assert.equal(screen.controller.year, '2026');
  }
  await act(async () => screen.controller.selectYear('2024'));
  await screen.resolve(fixture('yearly', '2026-10-29', '2024'));
  await act(async () => screen.controller.clearChartCategories());
  await act(async () => screen.controller.toggleChartCategory('2'));
  await act(async () => screen.controller.selectView('monthly'));
  assert.deepEqual(screen.requests.at(-1).query, { view: 'monthly', endMonth: '2026-09' });
  await screen.resolve({ ...fixture(), monthlyExpenses: [{ month: '2026-09' }] });
  await act(async () => screen.controller.selectView('yearly'));
  assert.deepEqual(screen.requests.at(-1).query, { view: 'yearly', year: '2024' });
  await screen.resolve(fixture('yearly', '2026-10-29', '2024'));
  await act(async () => screen.controller.refresh()); // Same intent used on route focus.
  assert.equal(screen.controller.year, '2024');
  assert.deepEqual(screen.controller.chartCategoryIds, ['2']);
  assert.equal(screen.controller.report.categoryExpenses.length, 2);
  await screen.resolve(fixture('yearly', '2026-10-29', '2024'));
  assert.equal(screen.controller.categoryReport.categoryExpenses.length, 1);
  assert.equal(screen.controller.active.id, '10');
});

test('Space and identity changes reset periods and filters and discard late reports', async (t) => {
  const screen = await mountController(t);
  await screen.resolve();
  await act(async () => screen.controller.selectView('yearly'));
  await screen.resolve(fixture('yearly'));
  await act(async () => screen.controller.selectYear('2025'));
  await screen.resolve(fixture('yearly', '2026-10-29', '2025'));
  await act(async () => screen.controller.toggleChartCategory('2'));
  await act(async () => screen.controller.refresh());
  const oldSpace = screen.requests.at(-1);
  const oldKey = screen.controller.scopeKey;
  harness.active = { id: '11' };
  // Exercise the active-Space guard even before session scope has caught up.
  await screen.rerender();
  assert.notEqual(screen.controller.scopeKey, oldKey);
  assert.equal(screen.controller.report, null);
  assert.equal(screen.controller.view, 'monthly');
  assert.equal(screen.controller.year, null);
  assert.equal(screen.controller.monthlyEndMonth, null);
  assert.deepEqual(screen.controller.chartCategoryIds, []);
  assert.deepEqual(screen.requests.at(-1).query, { view: 'monthly' });
  assert.equal(screen.requests.at(-1).spaceId, '11');
  await act(async () => oldSpace.resolve(fixture('yearly', '2026-10-29', '2025')));
  assert.equal(screen.controller.report, null);
  await screen.resolve();
  await act(async () => screen.controller.toggleChartCategory('1'));
  await act(async () => screen.controller.refresh());
  const oldIdentity = screen.requests.at(-1);
  harness.authorized = { scope: { generation: 2, userId: 'user-b', spaceId: '11' }, isCurrent: () => true };
  await screen.rerender();
  await act(async () => oldIdentity.resolve(fixture()));
  assert.equal(screen.controller.report, null);
  assert.deepEqual(screen.controller.chartCategoryIds, []);
  await screen.resolve();
  assert.deepEqual(screen.controller.report, fixture());
});

test('opening Yearly during initial loading pins the returned year and supports early empty years', async (t) => {
  const screen = await mountController(t);
  const initialMonthly = screen.requests[0];
  await act(async () => screen.controller.selectView('yearly'));
  assert.deepEqual(screen.requests.at(-1).query, { view: 'yearly' });
  await screen.resolve(fixture('yearly'));
  assert.equal(screen.controller.year, '2026');
  assert.deepEqual(screen.requests.at(-1).query, { view: 'yearly', year: '2026' });
  await screen.resolve(fixture('yearly'));
  await act(async () => initialMonthly.resolve(fixture()));
  assert.equal(screen.controller.report.range.view, 'yearly');
  await act(async () => screen.controller.selectYear('0001'));
  assert.deepEqual(screen.requests.at(-1).query, { view: 'yearly', year: '0001' });
});

test('foreground and Manila midnight refresh retain the selected year and offer the new year', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.parse('2026-12-31T15:59:30Z') });
  const screen = await mountController(t);
  await screen.resolve(fixture('monthly', '2026-12-31'));
  await act(async () => screen.controller.selectView('yearly'));
  await screen.resolve(fixture('yearly', '2026-12-31'));
  const count = screen.requests.length;
  await act(async () => t.mock.timers.tick(60_000));
  assert.equal(screen.requests.length, count + 1);
  assert.deepEqual(screen.requests.at(-1).query, { view: 'yearly', year: '2026' });
  await screen.resolve(fixture('yearly', '2027-01-01'));
  assert.equal(screen.controller.year, '2026');
  await act(async () => screen.controller.selectYear('2027'));
  assert.deepEqual(screen.requests.at(-1).query, { view: 'yearly', year: '2027' });
  await screen.resolve(fixture('yearly', '2027-01-01', '2027'));
  harness.appState = 'background';
  await act(async () => t.mock.timers.tick(24 * 60 * 60_000));
  const beforeResume = screen.requests.length;
  harness.appState = 'active';
  await act(async () => harness.onAppState('active'));
  assert.equal(screen.requests.length, beforeResume + 1);
  assert.equal(screen.controller.year, '2027');
});

test('Category filters update only chart data, retain the report, and survive refresh', async (t) => {
  const requests = [];
  const report = {
    range: { view: 'monthly', today: '2026-10-29', fromDate: '2026-05-01' },
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
  assert.deepEqual(controller.chartCategoryIds, ['1', '2']);
  await act(async () => controller.clearChartCategories());
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
  assert.deepEqual(controller.chartCategoryIds, ['1', '2']);
  assert.deepEqual(controller.categoryReport.categoryExpenses, report.categoryExpenses);
});

test('three stable defaults include inactive history; explicit All and larger selections survive mode changes and refresh', async (t) => {
  const screen = await mountController(t);
  const complete = {
    ...fixture(),
    categoryExpenses: [
      { categoryId: '7', isActive: false },
      { categoryId: '2', isActive: true },
      { categoryId: '9', isActive: true },
      { categoryId: '4', isActive: true },
    ],
    summary: { actualAmount: '400.01', expenseCount: '9', planned: { amount: '400.00' }, statementImports: { count: '3' } },
    budgetChecks: { monthly: [{ eligibleMonths: 9, overBudgetMonths: 2 }], yearly: [{ status: 'over' }] },
  };
  await screen.resolve(complete);
  assert.deepEqual(screen.controller.chartCategoryIds, ['7', '2', '9']);
  const markers = screen.controller.categoryMarkers;
  assert.equal(new Set(Object.values(markers)).size, 4);
  const assertIndependent = () => {
    assert.equal(screen.controller.report, complete);
    for (const key of ['summary', 'monthlyExpenses', 'budgetChecks']) {
      assert.equal(screen.controller.categoryReport[key], complete[key]);
    }
  };
  assertIndependent();
  await act(async () => screen.controller.toggleChartCategory('4'));
  assert.equal(screen.controller.chartCategoryIds.length, 4);
  assertIndependent();
  await act(async () => screen.controller.clearChartCategories());
  assert.deepEqual(screen.controller.chartCategoryIds, []);
  assert.equal(screen.controller.categoryReport, complete);
  await act(async () => screen.controller.refresh());
  await screen.resolve({ ...complete, categoryExpenses: [...complete.categoryExpenses].reverse() });
  assert.deepEqual(screen.controller.chartCategoryIds, []);
  assert.deepEqual(screen.controller.categoryMarkers, markers);
  await act(async () => screen.controller.selectView('yearly'));
  await screen.resolve({ ...complete, range: { ...complete.range, view: 'yearly' } });
  assert.deepEqual(screen.controller.chartCategoryIds, []);
  assert.deepEqual(screen.controller.categoryMarkers, markers);
});
