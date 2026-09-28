import { Inject, Injectable } from '@nestjs/common';
import { normalizeMatchingText } from '../../normalization/matching-text';
import {
  MAX_CATEGORY_SUGGESTION_EXAMPLES,
  MAX_SUGGESTIBLE_ACTIVE_CATEGORIES,
  STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE,
  STATEMENT_CATEGORY_SUGGESTION_EVALUATOR,
  type CategorySuggestion,
  type CategorySuggestionCatalog,
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

    const catalog =
      await this.catalogStore.findSuggestionCatalogInSpace(spaceId);
    const { categories } = catalog;
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
        selectRelevantExamples(description, catalog.examples, categories),
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

function selectRelevantExamples(
  transactionDescription: string,
  examples: CategorySuggestionCatalog['examples'],
  categories: CategorySuggestionCatalog['categories'],
): CategorySuggestionCatalog['examples'] {
  const targetTokens = descriptionTokens(transactionDescription);
  if (targetTokens.size === 0) return [];

  const activeCategoryIds = new Set(categories.map(({ id }) => id));
  const rankedExamples = examples
    .map((example, index) => ({
      example,
      index,
      overlap: [...descriptionTokens(example.description)].filter((token) =>
        targetTokens.has(token),
      ).length,
    }))
    .filter(
      ({ example, overlap }) =>
        overlap > 0 && activeCategoryIds.has(example.categoryId),
    )
    .sort(
      (left, right) => right.overlap - left.overlap || left.index - right.index,
    );

  const selected: CategorySuggestionCatalog['examples'][number][] = [];
  const selectedCategoryIds = new Set<string>();
  for (const { example } of rankedExamples) {
    if (selectedCategoryIds.has(example.categoryId)) continue;
    selected.push(example);
    selectedCategoryIds.add(example.categoryId);
    if (selected.length === MAX_CATEGORY_SUGGESTION_EXAMPLES) break;
  }

  return selected;
}

function descriptionTokens(description: string): Set<string> {
  return new Set(
    normalizeMatchingText(description)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1 && /\p{L}/u.test(token)),
  );
}
