import type { BudgetPeriod } from './budget-store';

export const CATEGORY_SUMMARY_STORE = Symbol('CATEGORY_SUMMARY_STORE');

export interface CategorySummaryQuery {
  userId: string;
  fromDate: string;
  toDate: string;
}

export interface CategorySummaryRow {
  categoryId: string;
  categoryName: string;
  categoryIsActive: boolean;
  totalAmount: string;
  transactionCount: string;
  budgetAmount: string | null;
  budgetPeriod: BudgetPeriod | null;
}

export interface CategorySummaryData {
  categories: CategorySummaryRow[];
  uncategorizedAmount: string;
  uncategorizedCount: string;
}

export interface CategorySummaryStore {
  findSummary(query: CategorySummaryQuery): Promise<CategorySummaryData>;
}
