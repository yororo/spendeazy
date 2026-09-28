import { Inject, Injectable } from '@nestjs/common';
import { normalizeMatchingText } from '../../normalization/matching-text';
import { rankCategorySuggestionIds } from './category-suggestion-display-policy';
import {
  MAX_CATEGORY_SUGGESTION_EXAMPLES,
  MAX_SUGGESTIBLE_ACTIVE_CATEGORIES,
  STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE,
  STATEMENT_CATEGORY_SUGGESTION_EVALUATOR,
  deduplicateCategorySuggestionCandidates,
  type CategorySuggestion,
  type CategorySuggestionCatalog,
  type CategorySuggestionCatalogStore,
  type CategorySuggestionDistribution,
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
  ): Promise<readonly CategorySuggestion[]> {
    const description = transactionDescription.trim();
    if (!description) return [];

    const targetTokens = descriptionTokens(description);
    const catalog =
      await this.catalogStore.findSuggestionCatalogInSpace(spaceId);
    const categories = deduplicateCategorySuggestionCandidates(
      catalog.categories,
    );
    if (
      categories.length === 0 ||
      categories.length > MAX_SUGGESTIBLE_ACTIVE_CATEGORIES
    ) {
      return [];
    }

    let distribution: CategorySuggestionDistribution | null;
    try {
      distribution = await this.evaluator.suggestCategory(
        description,
        categories,
        selectRelevantExamples(targetTokens, catalog.examples, categories),
      );
    } catch {
      return [];
    }

    if (!distribution) return [];

    const selectedCategoryIds = rankCategorySuggestionIds(
      categories,
      distribution.choice,
      distribution.probabilities,
    );
    const suggestions: CategorySuggestion[] = [];
    for (const categoryId of selectedCategoryIds) {
      const currentCategory = await this.catalogStore.findActiveCategoryInSpace(
        spaceId,
        categoryId,
      );
      if (!currentCategory || currentCategory.id !== categoryId) continue;

      suggestions.push({
        categoryId: currentCategory.id,
        categoryName: currentCategory.name,
      });
    }

    return suggestions;
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
