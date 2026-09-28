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

const MINIMUM_RELEVANT_TOKEN_LENGTH = 2;

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

    const targetTokens = descriptionTokens(description);
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
        selectRelevantExamples(targetTokens, catalog.examples, categories),
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
  targetTokens: ReadonlySet<string>,
  examples: CategorySuggestionCatalog['examples'],
  categories: CategorySuggestionCatalog['categories'],
): CategorySuggestionCatalog['examples'] {
  if (targetTokens.size === 0) return [];

  const activeCategoryIds = new Set(categories.map(({ id }) => id));
  const tokenizedExamples = examples
    .filter((example) => activeCategoryIds.has(example.categoryId))
    .map((example, index) => ({
      example,
      index,
      tokens: descriptionTokens(example.description),
    }));
  const matchingTokenFrequencies = new Map<string, number>();
  for (const { tokens } of tokenizedExamples) {
    for (const token of tokens) {
      if (!targetTokens.has(token)) continue;
      matchingTokenFrequencies.set(
        token,
        (matchingTokenFrequencies.get(token) ?? 0) + 1,
      );
    }
  }

  const rankedExamples = tokenizedExamples
    .map(({ example, index, tokens }) => ({
      example,
      index,
      relevance: [...tokens].reduce((score, token) => {
        if (!targetTokens.has(token)) return score;
        // A rare shared word is a stronger merchant clue than a generic one.
        const frequency = matchingTokenFrequencies.get(token);
        return frequency ? score + 1 / frequency : score;
      }, 0),
    }))
    .filter(({ relevance }) => relevance > 0)
    .sort(
      (left, right) =>
        right.relevance - left.relevance || left.index - right.index,
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
      .filter(
        (token) =>
          token.length >= MINIMUM_RELEVANT_TOKEN_LENGTH && /\p{L}/u.test(token),
      ),
  );
}
