type CategoryRuleMatchType = "exact" | "contains";

function isCategoryRuleMatchType(
  value: unknown,
): value is CategoryRuleMatchType {
  return value === "exact" || value === "contains";
}

function normalizeCategoryRulePattern(value: string) {
  return value.trim().replace(/\s+/gu, " ").toUpperCase();
}

export {
  isCategoryRuleMatchType,
  normalizeCategoryRulePattern,
};
export type { CategoryRuleMatchType };
