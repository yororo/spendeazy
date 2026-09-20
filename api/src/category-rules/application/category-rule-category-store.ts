export const CATEGORY_RULE_CATEGORY_STORE = Symbol(
  'CATEGORY_RULE_CATEGORY_STORE',
);

export interface CategoryRuleCategoryRecord {
  id: string;
  userId: string;
  spaceId?: string;
  isActive: boolean;
}

export interface CategoryRuleCategoryStore {
  findById(
    userId: string,
    id: string,
  ): Promise<CategoryRuleCategoryRecord | null>;
  findBySpaceId?(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleCategoryRecord | null>;
}
