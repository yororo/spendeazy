export interface DefaultCategoryDefinition {
  name: string;
  description: string;
}

export const DEFAULT_CATEGORY_CATALOG = [
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
] as const satisfies readonly DefaultCategoryDefinition[];
