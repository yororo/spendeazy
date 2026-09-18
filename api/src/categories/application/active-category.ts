import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from './category-errors';

export interface CategoryActivity {
  isActive: boolean;
}

export function assertActiveCategory(
  category: CategoryActivity | null,
): asserts category is CategoryActivity {
  if (!category) {
    throw new CategoryNotFoundError();
  }
  if (!category.isActive) {
    throw new CategoryInactiveError();
  }
}
