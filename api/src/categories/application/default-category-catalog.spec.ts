import { DEFAULT_CATEGORY_CATALOG } from './default-category-catalog';

describe('Default Category catalog', () => {
  it('defines the agreed Categories in creation order', () => {
    expect(
      DEFAULT_CATEGORY_CATALOG.map(({ name, description }) => ({
        name,
        description,
      })),
    ).toEqual([
      {
        name: 'Food & Drink',
        description: 'Restaurants, cafes, bars',
      },
      {
        name: 'Car',
        description: 'Private car, fuel, maintenance',
      },
      {
        name: 'Commute',
        description: 'Taxis, trains, public transport',
      },
      {
        name: 'Health & Wellness',
        description: 'Medical expenses, pharmacy, fitness, hospital, vitamins',
      },
      {
        name: 'Shopping',
        description: 'Clothes, electronics, gifts',
      },
      {
        name: 'Fun & Leisure',
        description: 'Movies, games, hobbies',
      },
      {
        name: 'Utilities',
        description: 'Electricity, water, internet, phone',
      },
      {
        name: 'House & Lot',
        description: 'Rent, mortgage, home maintenance',
      },
      {
        name: 'Groceries',
        description: 'Supermarket, food shopping',
      },
      {
        name: 'Giving',
        description: 'Donations, charitable contributions',
      },
      {
        name: 'Health Insurance',
        description: 'Health insurance premiums and related expenses',
      },
      {
        name: 'Child Expenses',
        description: 'Childcare, education, toys',
      },
      {
        name: 'Helper Services',
        description: 'Cleaning, gardening, handyman services',
      },
      {
        name: 'App Subscriptions',
        description: 'Mobile apps, software subscriptions',
      },
      {
        name: 'Others',
        description: 'Miscellaneous expenses not covered by other categories',
      },
    ]);
    expect(
      DEFAULT_CATEGORY_CATALOG.map(({ iconKey, color }) => [iconKey, color]),
    ).toEqual([
      ['utensils', 'coral'],
      ['car-front', 'cobalt'],
      ['bus', 'sky'],
      ['heart-pulse', 'emerald'],
      ['shopping-bag', 'magenta'],
      ['ticket', 'violet'],
      ['plug-zap', 'amber'],
      ['house', 'teal'],
      ['shopping-basket', 'lime'],
      ['heart-handshake', 'rose'],
      ['shield-plus', 'forest'],
      ['baby', 'orchid'],
      ['wrench', 'copper'],
      ['smartphone', 'azure'],
      ['shapes', 'slate'],
    ]);
  });

  it('contains no development-only Budget values', () => {
    expect(DEFAULT_CATEGORY_CATALOG).toHaveLength(15);
    expect(
      DEFAULT_CATEGORY_CATALOG.every(
        (category) => !Object.hasOwn(category, 'monthlyBudget'),
      ),
    ).toBe(true);
  });
});
