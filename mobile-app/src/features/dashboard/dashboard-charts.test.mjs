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
    contents: `${await readFile(new URL('./dashboard-view.tsx', import.meta.url), 'utf8')}\nexport { MonthlyChart, CategoryChart };`,
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
  if (name === 'lucide-react-native') return { ChevronDown: 'ChevronDown', Info: 'Info' };
  if (name === '@/navigation/app-theme') return { useAppTheme: () => ({
    palette: new Proxy({}, { get: () => '#123456' }), fonts: { regular: 'Outfit', medium: 'Outfit', semibold: 'Outfit' },
  }) };
  if (name === '@/components/buttons') return { CompactAction: button, SecondaryButton: button };
  if (name === '@/components/choice-sheet') return { ChoiceSheet: ({ visible, children, ...props }) =>
    React.createElement('Sheet', { visible, ...props }, visible ? children : null) };
  if (name === '@/components/screen') return { BodyText: 'BodyText', Screen: 'Screen' };
  if (name === '@/components/design-surface') return { DesignSurface: 'Surface' };
  if (name === '@/components/text-field') return { TextField: 'TextField' };
  if (name === '@/components/category-mark') return { CategoryIconMark: 'CategoryIconMark' };
  if (name === '@/constants/theme') return { space: {}, typeScale: { sectionTitle: 15 } };
  if (name === '@/features/categories/category-catalog') return { CATEGORY_COLOR_VALUES: {} };
  return require(name);
}, compiledModule);
const { MonthlyChart, CategoryChart } = compiledModule.exports;

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
const action = (renderer, label) => renderer.root.findAllByType('Action').find((node) => node.props.label === label);
const target = (renderer, prefix) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel?.startsWith(prefix));

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
  const contents = renderer.root.findAllByType('BodyText').map((node) => node.props.children).join(' ');
  assert.match(contents, /Monthly limit ₱400.00/u);
  assert.match(contents, /No Monthly limit · Annual limit ₱1,200.00/u);
  await act(async () => action(renderer, 'View Expenses · Category 2').props.onPress());
  assert.deepEqual(opened.pop(), { fromDate: '2026-10-01', toDate: '2026-10-29', categoryId: '2' });
  await act(async () => target(renderer, 'Category 1,').props.onPress());
  assert.deepEqual(opened.pop(), { fromDate: '2026-01-01', toDate: '2026-10-29', categoryId: '1' });
});
