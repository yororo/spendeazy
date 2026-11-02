import type {
  CategoryConfigurationDraft,
  CategoryConfigurationSave,
} from '../../api/categories-api-client.ts';

export type CategoryConfigurationField = 'name' | 'budget' | 'rules';
export type CategoryConfigurationIssue = {
  field: CategoryConfigurationField;
  message: string;
};

export function defaultCategoryBudget(): NonNullable<
  CategoryConfigurationDraft['budget']
> {
  return { amount: '0.00', currency: 'PHP', recurrence: 'monthly' };
}

export function defaultCategoryConfigurationDraft(): CategoryConfigurationDraft {
  return {
    name: '',
    iconKey: 'shapes',
    colorKey: 'teal',
    isActive: true,
    budget: defaultCategoryBudget(),
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

  const budgetInput = draft.budget ?? defaultCategoryBudget();
  const amount = nonNegativePhp(budgetInput.amount);
  let budget: CategoryConfigurationDraft['budget'] = null;
  if (amount === null) {
    issues.push({ field: 'budget', message: 'Enter a positive peso amount with up to two decimal places.' });
  } else if (amount === '0.00') {
    budget = null;
  } else {
    budget = { ...budgetInput, amount };
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

function nonNegativePhp(value: string): string | null {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{0,2})?$/u.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
