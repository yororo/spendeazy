import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadNativeView } from '../../../scripts/native-view-test.mjs';

const { hosts, View: ExpenseBrowse } = await loadNativeView(new URL('./browse-view.tsx', import.meta.url), 'ExpenseBrowse');

function render(patch = {}, onBackToDashboard = undefined) {
  hosts.length = 0;
  const intents = [];
  const controller = {
    spaceId: 'personal', selection: { spaceId: 'personal', fromDate: '', toDate: '', categoryId: null, description: '', sort: 'newest' },
    categories: { categories: [], loading: false, error: null }, issues: [], queryKey: '', loaded: null, error: null,
    phase: 'ready', refreshing: false, loadingMore: false, spacesLoading: false, spacesRefreshing: false,
    refreshSpaces: () => intents.push('spaces'), reload: () => intents.push('refresh'), retry: () => intents.push('retry'), loadMore: () => intents.push('more'),
    updateSelection: patch => intents.push(patch), readScroll: () => 0, rememberScroll: offset => intents.push(offset), ...patch,
  };
  const text = renderToStaticMarkup(React.createElement(ExpenseBrowse, { controller, onOpenExpense: id => intents.push(id), onBackToDashboard, spaceStatus: 'Personal' }));
  return { text, intents, find: label => hosts.find(props => props.accessibilityLabel === label) };
}
const expense = { id: '1', description: 'Cafe', amount: '10.00', expenseDate: '2026-10-24', categoryId: 'food' };
const loaded = { expenses: [expense], totalCount: '7', totalAmount: '70.00', nextCursor: 'next' };

test('browse renders supplied results and exposes accessible navigation and filter intents', () => {
  const view = render({ loaded });
  assert.match(view.text, /7 Expenses · 70.00 PHP for this selection/);
  const row = view.find('Cafe, 2026-10-24');
  assert.equal(row.accessibilityRole, 'button'); row.onPress();
  view.find('From').onChangeText('2026-01-01');
  view.find('Oldest').onPress(); view.find('Load more').onPress();
  hosts.find(props => props.name === 'RefreshControl').onRefresh();
  hosts.find(props => props.name === 'FlatList').onScroll({ nativeEvent: { contentOffset: { y: 120 } } });
  assert.deepEqual(view.intents, ['1', { fromDate: '2026-01-01' }, { sort: 'oldest' }, 'more', 'spaces', 'refresh', 120]);
});

test('browse renders loading, empty, invalid filters, and retry states without a session', () => {
  assert.match(render({ phase: 'loading' }).text, /Loading Expenses/);
  assert.match(render({ loaded: { ...loaded, expenses: [] } }).text, /No Expenses in this Space yet/);
  const invalid = render({ issues: [{ field: 'fromDate', message: 'Enter the start date as YYYY-MM-DD.' }] });
  assert.match(invalid.text, /Enter the start date/);
  assert.ok(hosts.some(props => props.accessibilityLiveRegion === 'polite'));
  const failed = render({ error: 'Could not reach Spendeazy.', phase: 'error' });
  assert.match(failed.text, /Could not reach Spendeazy/);
  failed.find('Retry').onPress(); assert.deepEqual(failed.intents, ['retry']);
});

test('pagination and refresh keep rows visible and hide duplicate pagination intent', () => {
  const append = render({ loaded, loadingMore: true });
  assert.match(append.text, /Cafe/); assert.match(append.text, /Loading more Expenses/);
  assert.equal(append.find('Load more'), undefined);
  const refresh = render({ loaded, refreshing: true });
  assert.match(refresh.text, /Cafe/); assert.equal(refresh.find('Load more'), undefined);
});

test('Dashboard drill-through exposes a return action', () => {
  const navigation = [];
  const view = render({}, () => navigation.push('dashboard'));
  const back = view.find('Back to Dashboard');
  assert.equal(back.accessibilityRole, 'button');
  back.onPress();
  assert.deepEqual(navigation, ['dashboard']);
});
