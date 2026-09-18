import {
  normalizeCategoryRulePattern,
  type CategoryRuleMatchType,
} from "@/shared/category-rule";

interface CategoryRuleDraft {
  readonly clientId: string;
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
}

interface CategoryRuleForDuplicateCheck {
  readonly id: string;
  readonly categoryId: string;
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
}

type CategoryRuleValidationErrors = Readonly<Record<string, string>>;

const CATEGORY_RULE_PATTERN_LIMIT = 500;

function getCategoryRuleIdentity(
  pattern: string,
  matchType: CategoryRuleMatchType,
) {
  return `${matchType}:${normalizeCategoryRulePattern(pattern)}`;
}

function getCategoryName(
  categories: readonly { readonly id: string; readonly name: string }[],
  categoryId: string,
) {
  return (
    categories.find((category) => category.id === categoryId)?.name ??
    `Category ${categoryId}`
  );
}

function validateCategoryRuleDraft(
  draftRules: readonly CategoryRuleDraft[],
  existingRules: readonly CategoryRuleForDuplicateCheck[],
  categoryId: string,
  categories: readonly { readonly id: string; readonly name: string }[],
): CategoryRuleValidationErrors {
  const errors: Record<string, string> = {};
  const identities = new Map<
    string,
    { readonly clientId: string; readonly categoryId: string }
  >();

  existingRules.forEach((rule) => {
    if (rule.categoryId === categoryId) return;

    identities.set(getCategoryRuleIdentity(rule.pattern, rule.matchType), {
      clientId: rule.id,
      categoryId: rule.categoryId,
    });
  });

  draftRules.forEach((rule) => {
    if (rule.pattern.trim().length === 0) {
      errors[rule.clientId] = "Pattern is required.";
      return;
    }

    if (rule.pattern.length > CATEGORY_RULE_PATTERN_LIMIT) {
      errors[rule.clientId] =
        "Pattern must be 500 characters or fewer.";
      return;
    }

    const identity = getCategoryRuleIdentity(rule.pattern, rule.matchType);
    const existingIdentity = identities.get(identity);
    if (existingIdentity) {
      if (existingIdentity.categoryId === categoryId) {
        errors[rule.clientId] =
          `${rule.matchType === "exact" ? "Exact" : "Contains"} pattern is duplicated in this Category.`;
      } else {
        const conflictingCategory = getCategoryName(
          categories,
          existingIdentity.categoryId,
        );
        errors[rule.clientId] =
          `This ${rule.matchType === "exact" ? "Exact" : "Contains"} pattern is already assigned to Category “${conflictingCategory}”.`;
      }
      return;
    }

    identities.set(identity, {
      clientId: rule.clientId,
      categoryId,
    });
  });

  return errors;
}

function areCategoryRuleDraftsEqual(
  first: readonly CategoryRuleDraft[],
  second: readonly CategoryRuleDraft[],
) {
  return (
    first.length === second.length &&
    first.every(
      (rule, index) =>
        rule.pattern === second[index]?.pattern &&
        rule.matchType === second[index]?.matchType,
    )
  );
}

export {
  areCategoryRuleDraftsEqual,
  getCategoryRuleIdentity,
  validateCategoryRuleDraft,
};
export type {
  CategoryRuleDraft,
  CategoryRuleForDuplicateCheck,
  CategoryRuleValidationErrors,
};
