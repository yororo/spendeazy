export const CATEGORY_RULE_CATEGORY_STORE = Symbol(
  'CATEGORY_RULE_CATEGORY_STORE',
);

export interface CategoryRuleCategoryRecord {
  id: string;
  spaceId: string;
  isActive: boolean;
}

export interface CategoryRuleCategoryStore {
  findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleCategoryRecord | null>;
}
