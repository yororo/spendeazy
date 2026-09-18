export const CATEGORY_RULE_STORE = Symbol('CATEGORY_RULE_STORE');
export const CATEGORY_RULE_PATTERN_MAX_LENGTH = 500;

export const CATEGORY_RULE_MATCH_TYPES = ['exact', 'contains'] as const;
export type CategoryRuleMatchType = (typeof CATEGORY_RULE_MATCH_TYPES)[number];
export const EXACT_CATEGORY_RULE_MATCH_TYPE: CategoryRuleMatchType = 'exact';

export interface CategoryRuleRecord {
  id: string;
  userId: string;
  categoryId: string;
  pattern: string;
  normalizedPattern: string;
  matchType: CategoryRuleMatchType;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCategoryRule {
  userId: string;
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
}

export interface ReplacementCategoryRule {
  pattern: string;
  matchType: CategoryRuleMatchType;
}

export interface NormalizedReplacementCategoryRule extends ReplacementCategoryRule {
  normalizedPattern: string;
}

export interface CategoryRuleStore {
  findById(userId: string, id: string): Promise<CategoryRuleRecord | null>;
  findAll(userId: string): Promise<CategoryRuleRecord[]>;
  findByNormalizedPattern(
    userId: string,
    normalizedPattern: string,
    excludingId?: string,
    matchType?: CategoryRuleMatchType,
  ): Promise<CategoryRuleRecord | null>;
  create(input: NewCategoryRule): Promise<CategoryRuleRecord>;
  update(
    userId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord | null>;
  delete(userId: string, id: string): Promise<boolean>;
  replaceForCategory(
    userId: string,
    categoryId: string,
    rules: NormalizedReplacementCategoryRule[],
  ): Promise<CategoryRuleRecord[]>;
}
