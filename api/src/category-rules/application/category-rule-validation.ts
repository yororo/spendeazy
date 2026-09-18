import { ApplicationError } from '../../errors/application-error';
import { VALIDATION_FAILED_CODE } from '../../errors/application-error-codes';
import { normalizeMatchingText } from '../../normalization/matching-text';
import { CategoryRulePatternConflictError } from './category-rule-errors';
import {
  CATEGORY_RULE_MATCH_TYPES,
  CATEGORY_RULE_PATTERN_MAX_LENGTH,
  type CategoryRuleRecord,
  type NormalizedReplacementCategoryRule,
} from './category-rule-store';

export function validateRulePattern(
  pattern: string,
  field = '/pattern',
): string {
  if (
    typeof pattern !== 'string' ||
    !/\S/u.test(pattern) ||
    [...pattern].length > CATEGORY_RULE_PATTERN_MAX_LENGTH
  ) {
    throw new ApplicationError(
      VALIDATION_FAILED_CODE,
      'The request contains invalid fields.',
      [
        {
          field,
          code: 'invalid_value',
          message:
            'Pattern must contain 1–500 characters and at least one non-whitespace character',
        },
      ],
    );
  }
  return normalizeMatchingText(pattern);
}

export function validateRuleMatchType(
  matchType: unknown,
  field = '/matchType',
): void {
  if (!CATEGORY_RULE_MATCH_TYPES.some((value) => value === matchType)) {
    throw new ApplicationError(
      VALIDATION_FAILED_CODE,
      'The request contains invalid fields.',
      [
        {
          field,
          code: 'invalid_value',
          message: 'Match type must be exact or contains',
        },
      ],
    );
  }
}

export function ruleKey(rule: {
  matchType: string;
  normalizedPattern: string;
}): string {
  return JSON.stringify([rule.matchType, rule.normalizedPattern]);
}

export function validateReplacementConflicts(
  categoryId: string,
  rules: NormalizedReplacementCategoryRule[],
  existingRules: CategoryRuleRecord[],
): void {
  const keys = new Set<string>();
  const otherCategories = new Map(
    existingRules
      .filter((rule) => rule.categoryId !== categoryId)
      .map((rule) => [ruleKey(rule), rule.categoryId]),
  );
  rules.forEach((rule, index) => {
    const key = ruleKey(rule);
    const conflictingCategoryId = otherCategories.get(key);
    if (keys.has(key) || conflictingCategoryId !== undefined) {
      throw new CategoryRulePatternConflictError(
        conflictingCategoryId ?? categoryId,
        `/rules/${index}/pattern`,
      );
    }
    keys.add(key);
  });
}
