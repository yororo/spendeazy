import { createHash } from 'node:crypto';
import { DEFAULT_CATEGORY_CATALOG } from '../../categories/application/default-category-catalog';

export const SEED_USER = {
  clerkUserId: 'user_3ImIZk7Tei43EK4wCUZDUULq7UQ',
  name: 'Seyf Sasy',
  email: 'seyfsasy@gmail.com',
} as const;

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
    pattern: 'Netflix',
  },
  {
    categoryName: 'Health & Wellness',
    pattern: 'FIX ONE AYALA MAKATI MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'TATERS GLORIETTA 4 MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'TITTOS AND RM 16 PASIG PASIG CITY PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'BUN RUN MAKATI MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'MAZZA SOLARIS MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'STARBUCKS 279 ST LUKE TAGUIG PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'LLAOLLAO BGCFT TAGUIG CITY PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'TANG KOREAN FLAVOURS TAGUIG PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'BORED & HUNGRY-OPUS QUEZON CITY PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'EPIC EATS OPUS MALL QUEZON CITY PH',
  },
  {
    categoryName: 'Health & Wellness',
    pattern: 'MED EXPRESS DRUGSTORE ST TAGUIG PH',
  },
  {
    categoryName: 'Health & Wellness',
    pattern: 'WATSONS-SM MAKATI MALL MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'CRISOSTOMO-ONE AYALA MAKATI PH',
  },
  {
    categoryName: 'Shopping',
    pattern: 'SM STORE-MAKATI MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'ARMYNAVY JUPITER MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'LLAOLLAO ONE AYALA MAKATI CITY PH',
  },
  {
    categoryName: 'Health & Wellness',
    pattern: 'TOBYS SPORTS ARENA MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'ITALIANNIS GLORIETTA 4 MAKATI CITY PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'SCOUTS HONOR BGC TAGUIG PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'AUNTIE ANNES UPTOWN MA TAGUIG PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'BLK 513 UPTOWN TAGUIG PH',
  },
  {
    categoryName: 'Shopping',
    pattern: 'URBAN TRAVELLER TAGUIG PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'LLAOLLAO VENICE TAGUIG PH',
  },
  {
    categoryName: 'Shopping',
    pattern: 'SM STORE BICUTAN PARANAQUE PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'MARUGAME TAGUIG PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'ATMOS OTAKU OBHS TAGUIG CITY PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'JAMBA JUICE BURGOS TAGUIG PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'PANCAKE HOUSE BURGOS C TAGUIG PH',
  },
  {
    categoryName: 'Shopping',
    pattern: 'LITTLE WAY FLOWER SHOP PASAY PH',
  },
  {
    categoryName: 'Groceries',
    pattern: 'LANDMARK BGC SUPERMARKET TAGUIG CITY PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'PLK PHILIPPINES MAKATI PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'LLAOLLAO BGC FD TAGUIG CITY PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'GOOBNE TAGUIG TAGUIG CITY PH',
  },
  {
    categoryName: 'Health & Wellness',
    pattern: 'MERCURYDRUGCORP364 CALAMBA PH',
  },
  {
    categoryName: 'Food & Drink',
    pattern: 'BOB MAIN TAGAYTAY PH',
  },
  {
    categoryName: 'Shopping',
    pattern: 'S&R MEMBERSHIP FORT TAGUIG PH',
  },
  {
    categoryName: 'Shopping',
    pattern: 'LAZADA PH MAKATI PH',
  },
  {
    categoryName: 'App Subscriptions',
    pattern: 'APPLE.COM/BILL HOLLYHILL IE',
  },
] as const;

export function dateInCurrentMonth(day: number, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
