import type {
  CategoryRuleCollectionRecord,
  CategoryRuleRecord,
  UpdateCategoryRule,
} from '../application/category-rule-store';
import type {
  CategoryRuleCollectionResponseDto,
  CategoryRuleResponseDto,
} from './category-rule-response.dto';
import type { UpdateCategoryRuleDto } from './category-rule.dto';

export function toCategoryRuleResponse(
  rule: CategoryRuleRecord,
): CategoryRuleResponseDto {
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    pattern: rule.pattern,
    matchType: rule.matchType,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function toCategoryRuleCollectionResponse(
  collection: CategoryRuleCollectionRecord,
): CategoryRuleCollectionResponseDto {
  return {
    rules: collection.rules.map(toCategoryRuleResponse),
    revision: collection.revision,
  };
}

export function toCategoryRuleUpdate(
  input: UpdateCategoryRuleDto,
): UpdateCategoryRule {
  const { updatedAt, ...changes } = input;
  return {
    ...changes,
    ...(updatedAt === undefined ? {} : { expectedUpdatedAt: updatedAt }),
  };
}

export function normalizeIfMatch(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}
