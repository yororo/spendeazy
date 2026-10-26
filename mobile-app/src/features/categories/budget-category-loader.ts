import type { CategoryConfiguration, SpaceCategory } from '@/api/categories-api-client';
import type { BudgetBrowseCategory } from './budget-browse';

export type SpaceBudgetCategory = SpaceCategory & Pick<CategoryConfiguration, 'budget'>;

export type BudgetCategoryConfigurationReader = {
  listCategories(spaceId: string): Promise<SpaceCategory[]>;
  getCategoryConfiguration(spaceId: string, categoryId: string): Promise<CategoryConfiguration>;
};

export async function loadBudgetCategories(
  spaceId: string,
  client: BudgetCategoryConfigurationReader,
): Promise<SpaceBudgetCategory[]> {
  const categories = await client.listCategories(spaceId);
  const configurations = await Promise.all(
    categories.map(({ id }) => client.getCategoryConfiguration(spaceId, id)),
  );

  return configurations.map(({ category, budget }) => ({
    ...category,
    budget,
  })) satisfies BudgetBrowseCategory[];
}
