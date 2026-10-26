import type {
  CategoryConfigurationDraft,
  CategoryConfigurationSave,
} from '../../api/categories-api-client.ts';

export type CategoryConfigurationField = 'name' | 'budget' | 'rules';
export type CategoryConfigurationIssue = {
  field: CategoryConfigurationField;
  message: string;
};

export function defaultCategoryConfigurationDraft(): CategoryConfigurationDraft {
  return {
    name: '',
    iconKey: 'shapes',
    colorKey: 'teal',
    isActive: true,
    budget: null,
    rules: [],
  };
}

export function prepareCategoryConfiguration(
  draft: CategoryConfigurationDraft,
): { ok: true; draft: CategoryConfigurationDraft } | { ok: false; issues: CategoryConfigurationIssue[] } {
  const name = draft.name.trim();
  const issues: CategoryConfigurationIssue[] = [];
  if (name.length === 0) issues.push({ field: 'name', message: 'Enter a Category name.' });
  if (name.length > 100) issues.push({ field: 'name', message: 'Category names can be up to 100 characters.' });

  let budget = draft.budget;
  if (budget) {
    const amount = positivePhp(budget.amount);
    if (amount === null) {
      issues.push({ field: 'budget', message: 'Enter a positive peso amount with up to two decimal places.' });
    } else {
      budget = { ...budget, amount };
    }
  }

  const rules = draft.rules.map((rule) => ({ ...rule, pattern: rule.pattern.trim() }));
  if (rules.some((rule) => rule.pattern.length === 0)) {
    issues.push({ field: 'rules', message: 'Enter text for each Category Rule.' });
  }
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    draft: {
      ...draft,
      name,
      budget,
      rules,
    },
  };
}

export function makeCategoryConfigurationSave(
  draft: CategoryConfigurationDraft,
  expectedRevision: string | null,
  expectedRulesRevision: string,
): CategoryConfigurationSave {
  return {
    name: draft.name,
    iconKey: draft.iconKey,
    colorKey: draft.colorKey,
    isActive: draft.isActive,
    budget: draft.budget ? { ...draft.budget } : null,
    rules: draft.rules.map(({ pattern, matchType }) => ({ pattern, matchType })),
    expectedRevision,
    expectedRulesRevision,
  };
}

function positivePhp(value: string): string | null {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{0,2})?$/u.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const cents = fraction.padEnd(2, '0');
  if (!/[1-9]/u.test(`${whole}${cents}`)) return null;
  return `${whole}.${cents}`;
}
