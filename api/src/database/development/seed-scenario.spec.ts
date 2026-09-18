import { DEFAULT_CATEGORY_CATALOG } from '../../categories/application/default-category-catalog';
import {
  SEED_CATEGORIES,
  SEED_CATEGORY_BUDGETS,
  SEED_CATEGORY_RULES,
} from './seed-scenario';

describe('development seed scenario', () => {
  it('derives seeded Category definitions from the production catalog', () => {
    expect(SEED_CATEGORIES).toEqual(DEFAULT_CATEGORY_CATALOG);
  });

  it('keeps the existing scenario Budget amounts associated with every catalog Category', () => {
    expect(SEED_CATEGORY_BUDGETS).toEqual([
      { categoryName: 'Food & Drink', monthlyBudget: '12000.00' },
      { categoryName: 'Car', monthlyBudget: '7000.00' },
      { categoryName: 'Commute', monthlyBudget: '3000.00' },
      { categoryName: 'Health & Wellness', monthlyBudget: '4000.00' },
      { categoryName: 'Shopping', monthlyBudget: '4000.00' },
      { categoryName: 'Fun & Leisure', monthlyBudget: '3000.00' },
      { categoryName: 'Utilities', monthlyBudget: '7000.00' },
      { categoryName: 'House & Lot', monthlyBudget: '27000.00' },
      { categoryName: 'Groceries', monthlyBudget: '14000.00' },
      { categoryName: 'Giving', monthlyBudget: '2000.00' },
      { categoryName: 'Health Insurance', monthlyBudget: '4000.00' },
      { categoryName: 'Child Expenses', monthlyBudget: '7000.00' },
      { categoryName: 'Helper Services', monthlyBudget: '3000.00' },
      { categoryName: 'App Subscriptions', monthlyBudget: '1500.00' },
      { categoryName: 'Others', monthlyBudget: '1500.00' },
    ]);

    expect(
      SEED_CATEGORY_BUDGETS.map(({ categoryName }) => categoryName),
    ).toEqual(DEFAULT_CATEGORY_CATALOG.map(({ name }) => name));
  });

  it('keeps every seeded Category rule resolvable against the catalog', () => {
    const categoryNames = new Set(
      DEFAULT_CATEGORY_CATALOG.map(({ name }) => name),
    );

    expect(
      SEED_CATEGORY_RULES.every(({ categoryName }) =>
        categoryNames.has(categoryName),
      ),
    ).toBe(true);
  });
});
