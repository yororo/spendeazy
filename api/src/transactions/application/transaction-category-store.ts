export const TRANSACTION_CATEGORY_STORE = Symbol('TRANSACTION_CATEGORY_STORE');

export interface TransactionCategoryRecord {
  id: string;
  userId: string;
  isActive: boolean;
}

export interface TransactionCategoryStore {
  findById(
    userId: string,
    id: string,
  ): Promise<TransactionCategoryRecord | null>;
}
