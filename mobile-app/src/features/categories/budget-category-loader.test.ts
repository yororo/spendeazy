import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBudgetCategories, type BudgetCategoryConfigurationReader } from './budget-category-loader.ts';
import type { CategoryConfiguration } from '@/api/categories-api-client';

function configuration(
  id: string,
  name: string,
  isActive: boolean,
  budget: CategoryConfiguration['budget'],
): CategoryConfiguration {
  return {
    category: {
      id,
      name,
      isActive,
      iconKey: 'shapes',
      colorKey: 'slate',
      revision: '1',
    },
    budget,
    rules: [],
    rulesRevision: '0',
  };
}

test('loads every active and inactive Category with its current optional Budget', async () => {
  const categories = [
    { id: '1', name: 'Food', isActive: true, iconKey: 'shapes', colorKey: 'slate', revision: '1' },
    { id: '2', name: 'Travel', isActive: true, iconKey: 'shapes', colorKey: 'slate', revision: '1' },
    { id: '3', name: 'Old plan', isActive: false, iconKey: 'shapes', colorKey: 'slate', revision: '1' },
  ] as const;
  const configs = [
    configuration('1', 'Food', true, { amount: '500.00', currency: 'PHP', recurrence: 'monthly' }),
    configuration('2', 'Travel', true, null),
    configuration('3', 'Old plan', false, { amount: '1200.00', currency: 'PHP', recurrence: 'yearly' }),
  ];
  const client: BudgetCategoryConfigurationReader = {
    async listCategories(spaceId) {
      assert.equal(spaceId, 'space-1');
      return [...categories];
    },
    async getCategoryConfiguration(spaceId, categoryId) {
      assert.equal(spaceId, 'space-1');
      return configs.find(({ category }) => category.id === categoryId)!;
    },
  };

  const loaded = await loadBudgetCategories('space-1', client);

  assert.deepEqual(
    loaded.map(({ id, name, isActive, budget }) => ({ id, name, isActive, budget })),
    [
      { id: '1', name: 'Food', isActive: true, budget: { amount: '500.00', currency: 'PHP', recurrence: 'monthly' } },
      { id: '2', name: 'Travel', isActive: true, budget: null },
      { id: '3', name: 'Old plan', isActive: false, budget: { amount: '1200.00', currency: 'PHP', recurrence: 'yearly' } },
    ],
  );
});

test('does not return a partial list when one Category configuration cannot be read', async () => {
  const client: BudgetCategoryConfigurationReader = {
    async listCategories() {
      return [
        { id: '1', name: 'Food', isActive: true, iconKey: 'shapes', colorKey: 'slate', revision: '1' },
      ];
    },
    async getCategoryConfiguration() {
      throw new Error('Configuration request failed.');
    },
  };

  await assert.rejects(() => loadBudgetCategories('space-1', client), /Configuration request failed/u);
});
