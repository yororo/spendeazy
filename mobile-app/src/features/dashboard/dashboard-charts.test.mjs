import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { build } from 'esbuild';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
// Exercise the real view/chart interactions, replacing only native rendering.
const compiled = await build({
  stdin: {
    contents: `${await readFile(new URL('./dashboard-view.tsx', import.meta.url), 'utf8')}\nexport { MonthlyChart, CategoryChart, MonthRangePicker, DashboardSummary, BudgetReview, CategoryReview };`,
    resolveDir: fileURLToPath(new URL('./', import.meta.url)), loader: 'tsx',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'native-boundaries', setup(builder) {
    builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path, external: true }));
  } }],
});
const button = ({ label, onPress, ...props }) => React.createElement('Action', { ...props, label, onPress });
const compiledModule = { exports: {} };
new Function('require', 'module', compiled.outputFiles[0].text)((name) => {
  if (name === 'react-native') return {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable',
    useWindowDimensions: () => ({ fontScale: 2 }),
    AccessibilityInfo: { announceForAccessibility() {} },
  };
  if (name === 'react-native-svg') return { __esModule: true, default: 'Svg', G: 'G', Line: 'Line', Polyline: 'Polyline', Rect: 'Rect', Circle: 'Circle', Path: 'Path', Polygon: 'Polygon' };
  if (name === 'lucide-react-native') return new Proxy({}, { get: (_, name) => name });
  if (name === '@/navigation/app-theme') return { useAppTheme: () => ({
    palette: new Proxy({}, { get: () => '#123456' }), fonts: { regular: 'Outfit', medium: 'Outfit', semibold: 'Outfit' },
  }) };
  if (name === '@/components/buttons') return { CompactAction: button, SecondaryButton: button };
  if (name === '@/components/choice-sheet') return { ChoiceSheet: ({ visible, children, ...props }) =>
    React.createElement('Sheet', { visible, ...props }, visible ? React.createElement(React.Fragment, null, props.headerAccessory, children) : null) };
  if (name === '@/components/popover') return { Popover: ({ visible, children, ...props }) =>
    React.createElement('Popover', { visible, ...props }, visible ? children : null) };
  if (name === '@/components/skeleton') return { SkeletonBlock: 'SkeletonBlock', SkeletonRegion: 'SkeletonRegion' };
  if (name === '@/components/screen') return { BodyText: 'BodyText', Screen: 'Screen' };
  if (name === '@/components/design-surface') return { DesignSurface: 'Surface' };
  if (name === '@/components/text-field') return { TextField: 'TextField' };
  if (name === '@/components/category-mark') return { CategoryIconMark: 'CategoryIconMark' };
  if (name === '@/constants/theme') return { space: {}, radius: { control: 16 }, controlSize: { minimumTarget: 48 }, typeScale: { sectionTitle: 15 } };
  if (name === '@/features/categories/category-catalog') return { CATEGORY_COLOR_VALUES: {} };
  return require(name);
}, compiledModule);
const { DashboardView, MonthlyChart, CategoryChart, MonthRangePicker, DashboardSummary, BudgetReview, CategoryReview } = compiledModule.exports;

function fixture() {
  const point = (month, toDate, actualAmount) => ({
    month, fromDate: `${month}-01`, toDate, actualAmount, expenseCount: actualAmount === '0.00' ? '0' : '1',
    inProgress: month === '2026-10', expenseFilter: { fromDate: `${month}-01`, toDate },
  });
  const monthlyExpenses = [point('2026-01', '2026-01-31', '0.00'), point('2026-10', '2026-10-29', '400.01')];
  return {
    range: { fromDate: '2026-01-01', toDate: '2026-10-29' },
    summary: { planned: { monthlyEquivalent: { amount: '400.00' } } },
    monthlyExpenses,
    categoryExpenses: ['1', '2'].map((categoryId) => ({
      categoryId, name: `Category ${categoryId}`, actualAmount: categoryId === '1' ? '400.01' : '0.00', expenseCount: categoryId === '1' ? '1' : '0',
      months: monthlyExpenses.map((month) => ({ ...month,
        actualAmount: categoryId === '1' ? month.actualAmount : '0.00',
        expenseCount: categoryId === '1' ? month.expenseCount : '0',
        monthlyBudgetAmount: categoryId === '1' ? '400.00' : null,
        annualBudgetAmount: categoryId === '2' ? '1200.00' : null,
        expenseFilter: { ...month.expenseFilter, categoryId },
      })),
    })),
  };
}
async function render(t, component, props) {
  let renderer;
  await act(async () => { renderer = create(React.createElement(component, props)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}
const action = (renderer, label) => renderer.root.findAllByType('Action').find((node) => node.props.label === label || node.props.accessibilityLabel === label);
const target = (renderer, prefix) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel?.startsWith(prefix));

test('monthly popover preserves all ranges and dismisses after selection', async (t) => {
  const selected = [];
  const renderer = await render(t, MonthRangePicker, { months: 3, onSelect: (months) => selected.push(months) });
  await act(async () => target(renderer, 'Choose period').props.onPress());
  assert.deepEqual(renderer.root.findAllByType('Action').map((node) => node.props.label), ['Last 1 month', 'Last 3 months', 'Last 6 months', 'Last 12 months', 'Year to date']);
  assert.equal(action(renderer, 'Last 3 months').props.selected, true);
  await act(async () => action(renderer, 'Last 6 months').props.onPress());
  assert.deepEqual(selected, [6]);
  assert.equal(renderer.root.findByType('Popover').props.visible, false);
});

test('zero bars and current-month details expose complete breakdowns and exact supplied filters', async (t) => {
  const report = fixture();
  const opened = [];
  const renderer = await render(t, MonthlyChart, { report, onOpenExpenses: (filter) => opened.push(filter) });
  assert.equal(action(renderer, 'Hide monthly values'), undefined);
  const january = target(renderer, 'Jan 2026');
  assert.ok(january.props.style.width >= 96); // 48 logical units at 2x text scale.
  await act(async () => january.props.onPress());
  const categoryAction = target(renderer, 'Category 2,');
  assert.ok(categoryAction); // Complete report includes a Category absent from the filtered line chart.
  await act(async () => categoryAction.props.onPress());
  assert.deepEqual(opened.pop(), { fromDate: '2026-01-01', toDate: '2026-01-31', categoryId: '2' });
  assert.equal(renderer.root.findByType('Sheet').props.visible, false);
  await act(async () => target(renderer, 'Oct 2026').props.onPress());
  await act(async () => action(renderer, 'View all Expenses for this month').props.onPress());
  assert.deepEqual(opened.pop(), { fromDate: '2026-10-01', toDate: '2026-10-29' });
});

test('Category month and period actions retain Category/date identity and supplied Budget references', async (t) => {
  const report = fixture();
  const opened = [];
  const renderer = await render(t, CategoryChart, {
    report, categories: report.categoryExpenses.map((category) => ({ id: category.categoryId, name: category.name, isActive: true })),
    selectedCategoryIds: [], categoryMarkers: { '1': 0, '2': 1 }, categoriesLoading: false,
    onToggleCategory() {}, onClearCategories() {}, onOpenExpenses: (filter) => opened.push(filter),
  });
  await act(async () => target(renderer, 'Oct 2026').props.onPress());
  const contents = renderer.root.findAllByType('Text').map((node) => node.props.children).join(' ');
  assert.match(contents, /Monthly limit ₱400.00/u);
  assert.match(contents, /No monthly limit · Annual limit ₱1,200.00/u);
  assert.match(contents, /In progress/);
  assert.doesNotMatch(contents, /2026-10-01/);
  assert.equal(target(renderer, 'Category 2, ₱0.00, No expenses'), undefined);
  const info = target(renderer, 'Period details');
  await act(async () => info.props.onPress());
  assert.match(renderer.root.findAllByType('Text').map(node => node.props.children).join(' '), /October 1, 2026 – October 29, 2026/);
  await act(async () => target(renderer, 'Category 1, ₱400.01, 1 expense').props.onPress());
  assert.deepEqual(opened.pop(), { fromDate: '2026-10-01', toDate: '2026-10-29', categoryId: '1' });
  assert.ok(renderer.root.findAllByType('Sheet').every(sheet => !sheet.props.visible));
  await act(async () => target(renderer, 'Category 1,').props.onPress());
  assert.deepEqual(opened.pop(), { fromDate: '2026-01-01', toDate: '2026-10-29', categoryId: '1' });
});

function reviewFixture() {
  const report = fixture();
  report.range.view = 'monthly';
  report.range.today = '2026-11-03';
  report.summary = {
    actualAmount: '400.01', expenseCount: '1',
    planned: { amount: '800.00', months: 2, monthlyEquivalent: { amount: '400.00' }, annualEquivalent: { amount: '4800.00' } },
    comparison: { direction: 'below_plan', difference: { amount: '399.99' }, percentage: null },
  };
  report.budgetChecks = { monthly: [{ categoryId: '1', name: 'Category 1', budgetAmount: '400.00', overBudgetMonths: 1, eligibleMonths: 2 }], yearly: [{ categoryId: '2', name: 'Insurance', year: '2026', actualAmount: '0.00', limitAmount: '30000.00', usageFromDate: '2026-01-01', usageToDate: '2026-11-03', expenseFilter: { fromDate: '2026-01-01', toDate: '2026-11-03', categoryId: '2' } }] };
  report.monthlyExpenses.forEach(point => { point.inProgress = false; });
  return report;
}

test('summary opens statements and import and shows concise budget wording', async (t) => {
  const calls = [];
  const renderer = await render(t, DashboardSummary, { report: reviewFixture(), onOpenExpenses() {}, onOpenImportHistory: () => calls.push('history'), onImport: () => calls.push('import') });
  await act(async () => action(renderer, 'Statements').props.onPress());
  await act(async () => action(renderer, 'Import statement').props.onPress());
  assert.deepEqual(calls, ['history', 'import']);
  const text = renderer.root.findAllByType('Text').map(node => node.props.children).join(' ');
  assert.match(text, /Planned/);
  assert.doesNotMatch(text, /Budgeted|Based on recorded expenses|Highest spend|Imported/);
});

test('budget review keeps annual checks when selected period is empty and opens exact annual expenses', async (t) => {
  const report = reviewFixture(); report.summary.expenseCount = '0';
  const calls = [];
  const renderer = await render(t, BudgetReview, { report, onOpenExpenses: filter => calls.push(filter), onOpenBudgetCategory() {} });
  assert.equal(target(renderer, 'Category 1,'), undefined);
  assert.ok(target(renderer, 'Insurance · 2026,').props.accessibilityLabel.includes('₱30,000.00 remaining'));
  await act(async () => target(renderer, 'Insurance · 2026,').props.onPress());
  await act(async () => action(renderer, 'Expenses').props.onPress());
  assert.deepEqual(calls[0], report.budgetChecks.yearly[0].expenseFilter);
  assert.equal(renderer.root.findByType('Sheet').props.visible, false);
});

test('category review reveals low spending through More and opens budget without leaving the sheet open', async (t) => {
  const report = reviewFixture();
  report.categoryExpenses.push(...['3','4'].map(id => ({ ...report.categoryExpenses[1], categoryId: id, name: 'Category ' + id })));
  const calls = [];
  const renderer = await render(t, CategoryReview, { report, onOpenExpenses() {}, onOpenBudgetCategory: id => calls.push(id) });
  assert.equal(target(renderer, 'Category 4,'), undefined);
  await act(async () => target(renderer, 'More, show all').props.onPress());
  assert.ok(target(renderer, 'Category 4,'));
  await act(async () => target(renderer, 'Category 4,').props.onPress());
  await act(async () => action(renderer, 'Budget').props.onPress());
  assert.deepEqual(calls, ['4']);
  assert.ok(renderer.root.findAllByType('Sheet').every(sheet => !sheet.props.visible));
});


test('dashboard shows resolved months and omits charts for a single month or an empty report', async (t) => {
  const report = reviewFixture();
  report.monthlyExpenses = [report.monthlyExpenses[1]];
  report.range.fromDate = '2026-10-01'; report.range.toDate = '2026-10-31';
  const controller = { report, categories: [], chartCategoryIds: [], categoryMarkers: {}, months: 1, view: 'monthly', refresh() {} };
  const renderer = await render(t, DashboardView, { controller, spaceStatus: null, onOpenExpenses() {}, onOpenBudgetCategory() {}, onOpenImportHistory() {} });
  assert.ok(target(renderer, 'Choose period, Oct 2026'));
  assert.equal(renderer.root.findAllByType('Svg').length, 0);
  assert.equal(action(renderer, 'Totals'), undefined);
  assert.equal(action(renderer, 'Trends'), undefined);
  assert.ok(renderer.root.findAllByType('Text').some(node => node.props.children === 'Category spending'));
  const empty = { ...report, summary: { ...report.summary, expenseCount: '0' } };
  await act(async () => renderer.update(React.createElement(DashboardView, { controller: { ...controller, report: empty }, spaceStatus: null, onOpenExpenses() {}, onOpenBudgetCategory() {}, onOpenImportHistory() {} })));
  assert.equal(renderer.root.findAllByType('Text').some(node => node.props.children === 'Category spending'), false);
  assert.ok(target(renderer, 'Insurance · 2026,'));
});


test('category spending starts with Trends before monthly spending and switches to all-category Totals', async (t) => {
  const report = reviewFixture();
  const controller = { report, categoryReport: { ...report, categoryExpenses: [report.categoryExpenses[0]] }, categories: [], chartCategoryIds: ['1'], categoryMarkers: { '1': 0, '2': 1 }, months: 12, view: 'monthly', refresh() {} };
  const budgets = [];
  const renderer = await render(t, DashboardView, { controller, spaceStatus: null, onOpenExpenses() {}, onOpenBudgetCategory: id => budgets.push(id), onOpenImportHistory() {} });
  const headings = () => renderer.root.findAllByType('Text').filter(node => node.props.accessibilityRole === 'header').map(node => node.props.children);
  assert.equal(headings().filter(title => title === 'Category spending').length, 1);
  assert.ok(headings().indexOf('Category spending') < headings().indexOf('Monthly spending'));
  assert.equal(action(renderer, 'Trends').props.selected, true);
  assert.ok(target(renderer, 'Choose categories'));
  await act(async () => action(renderer, 'Totals').props.onPress());
  assert.equal(action(renderer, 'Totals').props.selected, true);
  assert.equal(target(renderer, 'Choose categories'), undefined);
  assert.ok(target(renderer, 'Category 2,'));
  await act(async () => target(renderer, 'Category 2,').props.onPress());
  await act(async () => action(renderer, 'Budget').props.onPress());
  assert.deepEqual(budgets, ['2']);
  await act(async () => action(renderer, 'Trends').props.onPress());
  assert.ok(target(renderer, 'Choose categories'));
});


test('budget checks switches between monthly and yearly details', async (t) => {
  const report = reviewFixture();
  const opened = [];
  const renderer = await render(t, BudgetReview, { report, onOpenExpenses: filter => opened.push(filter), onOpenBudgetCategory() {} });
  assert.equal(action(renderer, 'Monthly').props.selected, true);
  assert.ok(target(renderer, 'Category 1,'));
  assert.equal(target(renderer, 'Insurance · 2026,'), undefined);
  await act(async () => action(renderer, 'Yearly').props.onPress());
  assert.equal(action(renderer, 'Yearly').props.selected, true);
  assert.equal(target(renderer, 'Category 1,'), undefined);
  await act(async () => target(renderer, 'Insurance · 2026,').props.onPress());
  await act(async () => action(renderer, 'Expenses').props.onPress());
  assert.deepEqual(opened, [report.budgetChecks.yearly[0].expenseFilter]);
  await act(async () => action(renderer, 'Monthly').props.onPress());
  assert.ok(target(renderer, 'Category 1,'));
});


test('monthly limits toggle hides thresholds and rescales spending while preserving exact budget details', async (t) => {
  const report = fixture();
  report.categoryExpenses[0].months.forEach(month => { month.monthlyBudgetAmount = '10000.00'; });
  const renderer = await render(t, CategoryChart, {
    report, categories: [], selectedCategoryIds: [], categoryMarkers: { '1': 0, '2': 1 }, categoriesLoading: false,
    onToggleCategory() {}, onClearCategories() {}, onOpenExpenses() {},
  });
  const limits = () => renderer.root.findAllByType('Line').filter(node => node.props.strokeDasharray === '4 4');
  const labels = () => renderer.root.findAllByType('Text').map(node => node.props.children);
  assert.equal(action(renderer, 'Hide monthly limits').props.selected, true);
  assert.ok(limits().length > 0);
  assert.ok(labels().includes('₱10,000.00'));
  await act(async () => action(renderer, 'Hide monthly limits').props.onPress());
  assert.equal(action(renderer, 'Show monthly limits').props.selected, false);
  assert.equal(limits().length, 0);
  assert.ok(labels().includes('₱400.01'));
  assert.ok(!labels().includes('₱10,000.00'));
  await act(async () => target(renderer, 'Oct 2026').props.onPress());
  assert.match(renderer.root.findAllByType('Text').map(node => node.props.children).join(' '), /Monthly limit ₱10,000.00/u);
  await act(async () => action(renderer, 'Show monthly limits').props.onPress());
  assert.ok(limits().length > 0);
});

