export const STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE = Symbol(
  'STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE',
);
export const STATEMENT_CATEGORY_SUGGESTION_EVALUATOR = Symbol(
  'STATEMENT_CATEGORY_SUGGESTION_EVALUATOR',
);

export const TYPE_SAFE_CHOICE_MAX_OPTIONS = 255;
export const MAX_SUGGESTIBLE_ACTIVE_CATEGORIES =
  TYPE_SAFE_CHOICE_MAX_OPTIONS - 1;

export interface CategorySuggestionCandidate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export interface CategorySuggestion {
  readonly categoryId: string;
  readonly categoryName: string;
}

export interface CategorySuggestionCatalogStore {
  findActiveCategoriesInSpace(
    spaceId: string,
  ): Promise<CategorySuggestionCandidate[]>;
  findActiveCategoryInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<CategorySuggestionCandidate | null>;
}

export interface CategorySuggestionEvaluator {
  suggestCategory(
    transactionDescription: string,
    categories: readonly CategorySuggestionCandidate[],
  ): Promise<string | null>;
}
