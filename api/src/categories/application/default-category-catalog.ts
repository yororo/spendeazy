import type { CategoryColor } from './category-color';
import type { CategoryIconKey } from './category-icon';

export interface DefaultCategoryDefinition {
  name: string;
  description: string;
  iconKey: CategoryIconKey;
  color: CategoryColor;
}

export const DEFAULT_CATEGORY_CATALOG = [
  {
    name: 'Food & Drink',
    description: 'Restaurants, cafes, bars',
    iconKey: 'utensils',
    color: 'coral',
  },
  {
    name: 'Car',
    description: 'Private car, fuel, maintenance',
    iconKey: 'car-front',
    color: 'cobalt',
  },
  {
    name: 'Commute',
    description: 'Taxis, trains, public transport',
    iconKey: 'bus',
    color: 'sky',
  },
  {
    name: 'Health & Wellness',
    description: 'Medical expenses, pharmacy, fitness, hospital, vitamins',
    iconKey: 'heart-pulse',
    color: 'emerald',
  },
  {
    name: 'Shopping',
    description: 'Clothes, electronics, gifts',
    iconKey: 'shopping-bag',
    color: 'magenta',
  },
  {
    name: 'Fun & Leisure',
    description: 'Movies, games, hobbies',
    iconKey: 'ticket',
    color: 'violet',
  },
  {
    name: 'Utilities',
    description: 'Electricity, water, internet, phone',
    iconKey: 'plug-zap',
    color: 'amber',
  },
  {
    name: 'House & Lot',
    description: 'Rent, mortgage, home maintenance',
    iconKey: 'house',
    color: 'teal',
  },
  {
    name: 'Groceries',
    description: 'Supermarket, food shopping',
    iconKey: 'shopping-basket',
    color: 'lime',
  },
  {
    name: 'Giving',
    description: 'Donations, charitable contributions',
    iconKey: 'heart-handshake',
    color: 'rose',
  },
  {
    name: 'Health Insurance',
    description: 'Health insurance premiums and related expenses',
    iconKey: 'shield-plus',
    color: 'forest',
  },
  {
    name: 'Child Expenses',
    description: 'Childcare, education, toys',
    iconKey: 'baby',
    color: 'orchid',
  },
  {
    name: 'Helper Services',
    description: 'Cleaning, gardening, handyman services',
    iconKey: 'wrench',
    color: 'copper',
  },
  {
    name: 'App Subscriptions',
    description: 'Mobile apps, software subscriptions',
    iconKey: 'smartphone',
    color: 'azure',
  },
  {
    name: 'Others',
    description: 'Miscellaneous expenses not covered by other categories',
    iconKey: 'shapes',
    color: 'slate',
  },
] as const satisfies readonly DefaultCategoryDefinition[];
