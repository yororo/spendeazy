export const CATEGORY_RULE_STORE = Symbol('CATEGORY_RULE_STORE');
export const CATEGORY_RULE_PATTERN_MAX_LENGTH = 500;

export const CATEGORY_RULE_MATCH_TYPES = ['exact', 'contains'] as const;
export type CategoryRuleMatchType = (typeof CATEGORY_RULE_MATCH_TYPES)[number];
export const EXACT_CATEGORY_RULE_MATCH_TYPE: CategoryRuleMatchType = 'exact';

export interface CategoryRuleRecord {
  id: string;
  spaceId: string;
  categoryId: string;
  pattern: string;
  normalizedPattern: string;
  matchType: CategoryRuleMatchType;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCategoryRule {
  spaceId: string;
  categoryId: string;
  pattern: string;
  normalizedPattern: string;
  matchType?: CategoryRuleMatchType;
}

export interface UpdateCategoryRule {
  matchType?: CategoryRuleMatchType;
  categoryId?: string;
  pattern?: string;
  normalizedPattern?: string;
  expectedUpdatedAt?: string;
}

export interface CategoryRuleCollectionRecord {
  rules: CategoryRuleRecord[];
  revision: string;
}

export interface ReplacementCategoryRule {
  pattern: string;
  matchType: CategoryRuleMatchType;
}

export interface NormalizedReplacementCategoryRule extends ReplacementCategoryRule {
  normalizedPattern: string;
}

export interface CategoryRuleStore {
  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleRecord | null>;
  findAllInSpace(spaceId: string): Promise<CategoryRuleCollectionRecord>;
  findByNormalizedPatternInSpace(
    spaceId: string,
    normalizedPattern: string,
    excludingId?: string,
    matchType?: CategoryRuleMatchType,
  ): Promise<CategoryRuleRecord | null>;
  createInSpace(input: NewCategoryRule): Promise<CategoryRuleRecord>;
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord | null>;
  deleteInSpace(
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean>;
  replaceForCategoryInSpace(
    spaceId: string,
    categoryId: string,
    rules: NormalizedReplacementCategoryRule[],
    expectedRevision?: string,
  ): Promise<CategoryRuleCollectionRecord>;
}
