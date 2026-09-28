export const STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE = Symbol(
  'STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE',
);
export const STATEMENT_CATEGORY_SUGGESTION_EVALUATOR = Symbol(
  'STATEMENT_CATEGORY_SUGGESTION_EVALUATOR',
);

export const CATEGORY_SUGGESTION_NONE_OUTCOME = 'none_of_the_above';
export const TYPE_SAFE_CHOICE_MAX_OPTIONS = 255;
export const MAX_SUGGESTIBLE_ACTIVE_CATEGORIES =
  TYPE_SAFE_CHOICE_MAX_OPTIONS - 1;
export const MAX_CATEGORY_SUGGESTION_EXAMPLES = 16;
export const MAX_CATEGORY_SUGGESTION_HISTORY_PER_CATEGORY = 4;
export const MAX_CATEGORY_SUGGESTIONS = 3;

export interface CategorySuggestionCandidate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export function deduplicateCategorySuggestionCandidates(
  categories: readonly CategorySuggestionCandidate[],
): readonly CategorySuggestionCandidate[] {
  const seenCategoryIds = new Set<string>();
  return categories.filter(({ id }) => {
    if (seenCategoryIds.has(id)) return false;
    seenCategoryIds.add(id);
    return true;
  });
}

export interface CategorySuggestionExample {
  readonly categoryId: string;
  readonly description: string;
}

export interface CategorySuggestionCatalog {
  readonly categories: readonly CategorySuggestionCandidate[];
  readonly examples: readonly CategorySuggestionExample[];
}

export interface CategorySuggestion {
  readonly categoryId: string;
  readonly categoryName: string;
}

export interface CategorySuggestionDistribution {
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
}

export interface CategorySuggestionCatalogStore {
  findSuggestionCatalogInSpace(
    spaceId: string,
  ): Promise<CategorySuggestionCatalog>;
  findActiveCategoryInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<CategorySuggestionCandidate | null>;
}

export interface CategorySuggestionEvaluator {
  suggestCategory(
    transactionDescription: string,
    categories: readonly CategorySuggestionCandidate[],
    examples: readonly CategorySuggestionExample[],
  ): Promise<CategorySuggestionDistribution | null>;
}
