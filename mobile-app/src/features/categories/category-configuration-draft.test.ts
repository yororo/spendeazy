import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCategoryConfigurationDraft,
  makeCategoryConfigurationSave,
  prepareCategoryConfiguration,
} from './category-configuration-draft.ts';

test('new Category configuration starts with no Budget or Rules and can be prepared as a complete request', () => {
  const draft = {
    ...defaultCategoryConfigurationDraft(),
    name: '  School supplies  ',
    budget: { amount: '1200', currency: 'PHP' as const, recurrence: 'yearly' as const },
    rules: [{ id: 'old-id', categoryId: '8', pattern: '  Campus Shop ', matchType: 'contains' as const }],
  };
  const prepared = prepareCategoryConfiguration(draft);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.draft.name, 'School supplies');
  assert.equal(prepared.draft.budget?.amount, '1200.00');
  assert.equal(prepared.draft.rules[0].pattern, 'Campus Shop');
  assert.deepEqual(
    makeCategoryConfigurationSave(prepared.draft, null, '0'),
    {
      name: 'School supplies', iconKey: 'shapes', colorKey: 'teal', isActive: true,
      budget: { amount: '1200.00', currency: 'PHP', recurrence: 'yearly' },
      rules: [{ pattern: 'Campus Shop', matchType: 'contains' }],
      expectedRevision: null, expectedRulesRevision: '0',
    },
  );
});

test('invalid name, Budget and blank Rules are returned as field issues without rewriting the draft', () => {
  const draft = {
    ...defaultCategoryConfigurationDraft(),
    budget: { amount: '0', currency: 'PHP' as const, recurrence: 'monthly' as const },
    rules: [{ pattern: '  ', matchType: 'exact' as const }],
  };
  const prepared = prepareCategoryConfiguration(draft);
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.deepEqual(prepared.issues.map(({ field }) => field), ['name', 'budget', 'rules']);
  assert.equal(draft.budget.amount, '0');
  assert.equal(draft.rules[0].pattern, '  ');
});

test('Budget formatting uses exact decimal strings and rejects amounts outside the API range', () => {
  for (const [amount, expected] of [['1.5', '1.50'], ['0.01', '0.01'], ['10000000000000', null], ['-1', null], ['0', null], ['1.999', null]]) {
    const prepared = prepareCategoryConfiguration({
      ...defaultCategoryConfigurationDraft(),
      name: 'Test',
      budget: { amount, currency: 'PHP', recurrence: 'monthly' },
    });
    if (expected === null) assert.equal(prepared.ok, false, amount);
    else {
      assert.equal(prepared.ok, true, amount);
      if (prepared.ok) assert.equal(prepared.draft.budget?.amount, expected);
    }
  }
});
