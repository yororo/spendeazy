import { TypeSafeClient, type Fetch } from '@typesafe-ai/sdk';
import type {
  CategorySuggestionCandidate,
  CategorySuggestionDistribution,
  CategorySuggestionExample,
  CategorySuggestionEvaluator,
} from '../application/statement-category-suggestions';
import {
  CATEGORY_SUGGESTION_NONE_OUTCOME,
  TYPE_SAFE_CHOICE_MAX_OPTIONS,
} from '../application/statement-category-suggestions';
import {
  buildTypeSafeCategorySuggestionRequest,
  TYPE_SAFE_CATEGORY_SUGGESTION_MODEL,
  TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
} from './typesafe-category-suggestion-request';

const PROBABILITY_SUM_TOLERANCE = 0.01;

export class TypeSafeCategorySuggestionEvaluator implements CategorySuggestionEvaluator {
  private client: TypeSafeClient | null | undefined;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchImplementation?: Fetch,
  ) {}

  async suggestCategory(
    transactionDescription: string,
    categories: readonly CategorySuggestionCandidate[],
    examples: readonly CategorySuggestionExample[],
  ): Promise<CategorySuggestionDistribution | null> {
    const client = this.getClient();
    if (
      !client ||
      categories.length === 0 ||
      categories.length >= TYPE_SAFE_CHOICE_MAX_OPTIONS
    ) {
      return null;
    }

    const categoryIds = new Set(categories.map(({ id }) => id));
    if (categoryIds.size !== categories.length) return null;

    try {
      const response = await client.systemOne(
        buildTypeSafeCategorySuggestionRequest(
          transactionDescription,
          categories,
          examples,
        ),
        {
          timeout: TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
          retry: { maxRetries: 0 },
        },
      );

      const answer = response.answers.suggestedCategory;
      if (answer.type !== 'choice') return null;

      if (
        !hasValidDistribution(answer.probabilities, answer.choice, categoryIds)
      ) {
        return null;
      }

      return {
        choice: answer.choice,
        probabilities: answer.probabilities,
      };
    } catch {
      return null;
    }
  }

  private getClient(): TypeSafeClient | null {
    if (this.client !== undefined) return this.client;
    if (!this.apiKey?.trim()) {
      this.client = null;
      return this.client;
    }

    try {
      this.client = new TypeSafeClient({
        apiKey: this.apiKey.trim(),
        defaultModel: TYPE_SAFE_CATEGORY_SUGGESTION_MODEL,
        timeout: TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
        retry: { maxRetries: 0 },
        logLevel: 'off',
        ...(this.fetchImplementation
          ? { fetch: this.fetchImplementation }
          : {}),
      });
    } catch {
      this.client = null;
    }

    return this.client;
  }
}

function hasValidDistribution(
  probabilities: Readonly<Record<string, number>>,
  selectedOptionId: string,
  categoryIds: ReadonlySet<string>,
): boolean {
  const optionIds = Object.keys(probabilities);
  const expectedOptionIds = new Set([
    ...categoryIds,
    CATEGORY_SUGGESTION_NONE_OUTCOME,
  ]);
  if (
    optionIds.length !== expectedOptionIds.size ||
    optionIds.some((optionId) => !expectedOptionIds.has(optionId))
  ) {
    return false;
  }

  const values = Object.values(probabilities);
  if (
    values.some(
      (probability) =>
        !Number.isFinite(probability) || probability < 0 || probability > 1,
    )
  ) {
    return false;
  }

  const totalProbability = values.reduce(
    (sum, probability) => sum + probability,
    0,
  );
  if (Math.abs(totalProbability - 1) > PROBABILITY_SUM_TOLERANCE) return false;

  const selectedProbability = probabilities[selectedOptionId];
  return (
    selectedProbability !== undefined &&
    values.every((probability) => probability <= selectedProbability)
  );
}
