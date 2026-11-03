import assert from 'node:assert/strict';
import test from 'node:test';
import type { DashboardReport } from '../../api/dashboard-report-api-client.ts';
import { budgetBalance, categoryBudgetDetail, rankReviewCategories } from './dashboard-review-rules.ts';

const category = (id: string, actual: string, monthly: string | null, annual: string | null = null): DashboardReport['categoryExpenses'][number] => ({
  categoryId: id, name: id, actualAmount: actual, expenseCount: '1', isActive: true, iconKey: 'car', colorKey: 'violet',
  budget: annual ? { period: 'yearly', amount: annual } : monthly ? { period: 'monthly', amount: monthly } : null,
  months: [{ month: '2026-10', actualAmount: actual, expenseCount: '1', budgetStatus: null, monthlyBudgetAmount: monthly, annualBudgetAmount: annual, expenseFilter: { fromDate: '2026-10-01', toDate: '2026-10-31', categoryId: id } }],
});

test('budget balances preserve exact overages, annual remaining and no-budget meaning', () => {
  assert.equal(budgetBalance('30000.00', '25000.00'), '₱5,000.00 over');
  assert.equal(budgetBalance('30000.01', '30000.00'), '₱0.01 over');
  assert.equal(budgetBalance('0.00', '30000.00'), '₱30,000.00 remaining');
  assert.equal(budgetBalance('30000.00', '30000.00'), 'At limit');
  assert.equal(budgetBalance('1000.00', '0.00'), 'No budget');
  assert.equal(budgetBalance('9007199254740993.01', '1.00'), '₱9,007,199,254,740,992.01 over');
});

test('review keeps low and zero spending categories and puts monthly overruns before large annual spending', () => {
  const entries = [category('travel', '100000.00', null, '100000.00'), category('commute', '1000.00', '5000.00'), category('groceries', '30000.00', '25000.00'), category('insurance', '0.00', null, '30000.00')];
  assert.deepEqual(rankReviewCategories(entries).map(item => item.categoryId), ['groceries', 'travel', 'commute', 'insurance']);
  assert.equal(entries[0].categoryId, 'travel');
  assert.equal(categoryBudgetDetail(entries[1]), '₱1,000.00 / ₱5,000.00 · ₱4,000.00 remaining');
  assert.equal(categoryBudgetDetail(entries[3]), '₱0.00 · Annual budget');
});

test('multi-month review labels total and monthly budget separately without treating annual limits as monthly', () => {
  const commute = category('commute', '2000.00', '5000.00');
  commute.months.push({ ...commute.months[0], month: '2026-09' });
  assert.equal(categoryBudgetDetail(commute), '₱2,000.00 total · ₱5,000.00 monthly budget');
});
