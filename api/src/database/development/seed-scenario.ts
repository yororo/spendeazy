import { createHash } from 'node:crypto';
import { DEFAULT_CATEGORY_CATALOG } from '../../categories/application/default-category-catalog';

export const SEED_USER = {
  clerkUserId: 'user_seed_expense_foundation',
  name: 'Sample User',
  email: 'seed-user@spendeazy.invalid',
} as const;

export const SEED_DATE = '2026-08-31';

export const SEED_CATEGORIES = DEFAULT_CATEGORY_CATALOG;

export const SEED_CATEGORY_BUDGETS = [
  {
    categoryName: 'Food & Drink',
    monthlyBudget: '12000.00',
  },
  {
    categoryName: 'Car',
    monthlyBudget: '7000.00',
  },
  {
    categoryName: 'Commute',
    monthlyBudget: '3000.00',
  },
  {
    categoryName: 'Health & Wellness',
    monthlyBudget: '4000.00',
  },
  {
    categoryName: 'Shopping',
    monthlyBudget: '4000.00',
  },
  {
    categoryName: 'Fun & Leisure',
    monthlyBudget: '3000.00',
  },
  {
    categoryName: 'Utilities',
    monthlyBudget: '7000.00',
  },
  {
    categoryName: 'House & Lot',
    monthlyBudget: '27000.00',
  },
  {
    categoryName: 'Groceries',
    monthlyBudget: '14000.00',
  },
  {
    categoryName: 'Giving',
    monthlyBudget: '2000.00',
  },
  {
    categoryName: 'Health Insurance',
    monthlyBudget: '4000.00',
  },
  {
    categoryName: 'Child Expenses',
    monthlyBudget: '7000.00',
  },
  {
    categoryName: 'Helper Services',
    monthlyBudget: '3000.00',
  },
  {
    categoryName: 'App Subscriptions',
    monthlyBudget: '1500.00',
  },
  {
    categoryName: 'Others',
    monthlyBudget: '1500.00',
  },
] as const;

export const SEED_CATEGORY_RULES = [
  {
    categoryName: 'App Subscriptions',
    pattern: 'Demo Streaming',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'Demo Café',
  },
  {
    categoryName: 'Groceries',
    pattern: 'Sample Market groceries',
  },
  {
    categoryName: 'Commute',
    pattern: 'Sample Transit',
  },
] as const;

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
