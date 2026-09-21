export const TRANSACTION_CATEGORY_STORE = Symbol('TRANSACTION_CATEGORY_STORE');

export interface TransactionCategoryRecord {
  id: string;
  spaceId: string;
  isActive: boolean;
}

export interface TransactionCategoryStore {
  findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<TransactionCategoryRecord | null>;
}
