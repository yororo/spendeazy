// In-memory fictional Category Rules only; never fetches suggestions.
const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ').toUpperCase();
export interface ProofRule { pattern: string; matchType: 'exact' | 'contains'; category: string; active: boolean }
export const demoRules: ProofRule[] = [
  { pattern: 'FICTIONAL JOURNEY', matchType: 'contains', category: 'Travel', active: true },
  { pattern: 'FICTIONAL JOURNEY', matchType: 'exact', category: 'Food', active: true },
  { pattern: 'AMBIGUOUS', matchType: 'contains', category: 'Food', active: true },
  { pattern: 'AMBIGUOUS', matchType: 'contains', category: 'Travel', active: true },
  { pattern: 'INACTIVE', matchType: 'exact', category: 'Retired', active: false },
];
export function matchCategory(description: string, rules = demoRules) {
  const applicable = rules.filter((rule) => rule.active && normalize(rule.pattern) && (rule.matchType === 'exact' ? normalize(description) === normalize(rule.pattern) : normalize(description).includes(normalize(rule.pattern))));
  const exact = applicable.filter((rule) => rule.matchType === 'exact');
  const categories = [...new Set((exact.length ? exact : applicable).map((rule) => rule.category))];
  return categories.length === 1 ? categories[0] : categories.length > 1 ? 'Ambiguous → Unmapped' : 'Unmapped';
}
