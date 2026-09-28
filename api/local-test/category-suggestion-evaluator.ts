import {
  CATEGORY_SUGGESTION_NONE_OUTCOME,
  type CategorySuggestionCandidate,
  type CategorySuggestionDistribution,
  type CategorySuggestionEvaluator,
} from '../src/statement-imports/application/statement-category-suggestions';

const E2E_SUGGESTED_CATEGORY_NAME = 'E2E Suggested Category';
const E2E_UNAVAILABLE_DESCRIPTION = 'Payment to Cafe Local Shop';
const E2E_SLOW_DESCRIPTION = 'Payment to Cafe Slow Shop';

export class LocalTestCategorySuggestionEvaluator implements CategorySuggestionEvaluator {
  suggestCategory(
    transactionDescription: string,
    categories: readonly CategorySuggestionCandidate[],
  ): Promise<CategorySuggestionDistribution> {
    if (transactionDescription === E2E_UNAVAILABLE_DESCRIPTION) {
      return Promise.reject(
        new Error('The local-test Jev stub simulated an unavailable service'),
      );
    }
    if (transactionDescription === E2E_SLOW_DESCRIPTION) {
      return new Promise<CategorySuggestionDistribution>(() => {});
    }

    const selectedCategory = categories.find(
      ({ name }) => name === E2E_SUGGESTED_CATEGORY_NAME,
    );

    if (!selectedCategory) {
      return Promise.resolve(
        createDistribution(categories, CATEGORY_SUGGESTION_NONE_OUTCOME),
      );
    }

    return Promise.resolve(createDistribution(categories, selectedCategory.id));
  }
}

function createDistribution(
  categories: readonly CategorySuggestionCandidate[],
  selectedOutcome: string,
): CategorySuggestionDistribution {
  const categoryProbability =
    selectedOutcome === CATEGORY_SUGGESTION_NONE_OUTCOME ? 0 : 0.8;
  const noneProbability =
    selectedOutcome === CATEGORY_SUGGESTION_NONE_OUTCOME ? 0.8 : 0.1;
  const otherCategoryProbability =
    (1 - categoryProbability - noneProbability) /
    Math.max(
      1,
      categories.length -
        (selectedOutcome === CATEGORY_SUGGESTION_NONE_OUTCOME ? 0 : 1),
    );
  const probabilities: Record<string, number> = {};
  categories.forEach(({ id }) => {
    probabilities[id] =
      id === selectedOutcome ? categoryProbability : otherCategoryProbability;
  });
  probabilities[CATEGORY_SUGGESTION_NONE_OUTCOME] = noneProbability;

  return { choice: selectedOutcome, probabilities };
}
