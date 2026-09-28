import { Inject, Injectable } from '@nestjs/common';
import {
  MAX_SUGGESTIBLE_ACTIVE_CATEGORIES,
  STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE,
  STATEMENT_CATEGORY_SUGGESTION_EVALUATOR,
  type CategorySuggestion,
  type CategorySuggestionCatalogStore,
  type CategorySuggestionEvaluator,
} from './statement-category-suggestions';

@Injectable()
export class StatementCategorySuggestionsService {
  constructor(
    @Inject(STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE)
    private readonly catalogStore: CategorySuggestionCatalogStore,
    @Inject(STATEMENT_CATEGORY_SUGGESTION_EVALUATOR)
    private readonly evaluator: CategorySuggestionEvaluator,
  ) {}

  async suggestInSpace(
    spaceId: string,
    transactionDescription: string,
  ): Promise<CategorySuggestion | null> {
    const description = transactionDescription.trim();
    if (!description) return null;

    const categories =
      await this.catalogStore.findActiveCategoriesInSpace(spaceId);
    if (
      categories.length === 0 ||
      categories.length > MAX_SUGGESTIBLE_ACTIVE_CATEGORIES
    ) {
      return null;
    }

    let selectedCategoryId: string | null;
    try {
      selectedCategoryId = await this.evaluator.suggestCategory(
        description,
        categories,
      );
    } catch {
      return null;
    }

    if (!selectedCategoryId) return null;

    const selectedFromRequest = categories.find(
      (category) => category.id === selectedCategoryId,
    );
    if (!selectedFromRequest) return null;

    const currentCategory = await this.catalogStore.findActiveCategoryInSpace(
      spaceId,
      selectedCategoryId,
    );
    if (!currentCategory) return null;

    return {
      categoryId: currentCategory.id,
      categoryName: currentCategory.name,
    };
  }
}
