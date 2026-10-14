export const EXPENSE_CATEGORY_STORE = Symbol('EXPENSE_CATEGORY_STORE');

export interface ExpenseCategoryRecord {
  id: string;
  spaceId: string;
  isActive: boolean;
}

export interface ExpenseCategoryStore {
  findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<ExpenseCategoryRecord | null>;
}
