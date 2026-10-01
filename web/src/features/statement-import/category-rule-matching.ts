import type { CategoryRuleMatchType } from "@/shared/category-rule";
import { normalizeDescription } from "./statement-import-utils";

interface RulePattern {
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
}

function hasSameRulePattern(rule: RulePattern, requested: RulePattern) {
  return rule.matchType === requested.matchType &&
    normalizeDescription(rule.pattern) === normalizeDescription(requested.pattern);
}

function matchesRuleDescription(description: string, rule: RulePattern) {
  const pattern = normalizeDescription(rule.pattern);
  if (!pattern) return false;
  const normalizedDescription = normalizeDescription(description);
  return rule.matchType === "exact"
    ? normalizedDescription === pattern
    : normalizedDescription.includes(pattern);
}

export { hasSameRulePattern, matchesRuleDescription };
