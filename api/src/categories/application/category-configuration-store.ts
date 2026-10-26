import type { CategoryColor } from './category-color';
import type { CategoryIconKey } from './category-icon';
import type { BudgetPeriod, BudgetRecord } from './budget-store';
import type { CategoryRecord } from './category-store';
import type {
  CategoryRuleRecord,
  NormalizedReplacementCategoryRule,
} from '../../category-rules/application/category-rule-store';

export const CATEGORY_CONFIGURATION_STORE = Symbol(
  'CATEGORY_CONFIGURATION_STORE',
);

export interface CategoryConfigurationRecord {
  category: CategoryRecord;
  budget: BudgetRecord | null;
  rules: CategoryRuleRecord[];
  rulesRevision: string;
}

export interface CategoryConfigurationFields {
  name: string;
  iconKey: CategoryIconKey;
  color: CategoryColor;
  isActive: boolean;
}

export interface CategoryConfigurationBudget {
  amount: string;
  recurrence: BudgetPeriod;
}

export interface CategoryConfigurationInput extends CategoryConfigurationFields {
  budget: CategoryConfigurationBudget | null;
  rules: Array<{ pattern: string; matchType: 'exact' | 'contains' }>;
  expectedRevision: string | null;
  expectedRulesRevision: string;
}

export interface NormalizedCategoryConfigurationInput extends CategoryConfigurationFields {
  budget: CategoryConfigurationBudget | null;
  rules: NormalizedReplacementCategoryRule[];
}

export interface CategoryConfigurationTransaction {
  readonly rulesRevision: string;
  findCategory(categoryId: string): Promise<CategoryRecord | null>;
  findCategoryByNormalizedName(name: string): Promise<CategoryRecord | null>;
  findBudget(categoryId: string): Promise<BudgetRecord | null>;
  findAllRules(): Promise<CategoryRuleRecord[]>;
  createCategory(
    spaceId: string,
    fields: CategoryConfigurationFields,
  ): Promise<CategoryRecord>;
  updateCategory(
    categoryId: string,
    fields: CategoryConfigurationFields,
  ): Promise<CategoryRecord | null>;
  replaceBudget(
    categoryId: string,
    budget: CategoryConfigurationBudget | null,
  ): Promise<void>;
  replaceRules(
    categoryId: string,
    rules: NormalizedReplacementCategoryRule[],
  ): Promise<void>;
  bumpRulesRevision(): Promise<string>;
}

export interface CategoryConfigurationStore {
  findInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<CategoryConfigurationRecord | null>;
  inWritableSpace<T>(
    spaceId: string,
    work: (transaction: CategoryConfigurationTransaction) => Promise<T>,
  ): Promise<T>;
}
