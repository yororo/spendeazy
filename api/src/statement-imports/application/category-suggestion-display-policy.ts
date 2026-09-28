import {
  CATEGORY_SUGGESTION_NONE_OUTCOME,
  MAX_CATEGORY_SUGGESTIONS,
  deduplicateCategorySuggestionCandidates,
  type CategorySuggestionCandidate,
} from './statement-category-suggestions';

export interface CategorySuggestionDisplayThresholds {
  readonly minimumPrimaryProbability: number;
  readonly minimumPrimaryMarginOverNone: number;
  readonly minimumAdditionalProbability: number;
  readonly minimumAdditionalMarginOverNone: number;
}

// These defaults are calibrated from the synthetic offline evaluation set.
export const CATEGORY_SUGGESTION_DISPLAY_THRESHOLDS: CategorySuggestionDisplayThresholds =
  {
    minimumPrimaryProbability: 0.5,
    minimumPrimaryMarginOverNone: 0.1,
    minimumAdditionalProbability: 0.25,
    minimumAdditionalMarginOverNone: 0.2,
  };

export function rankCategorySuggestionIds(
  categories: readonly CategorySuggestionCandidate[],
  choice: string,
  probabilities: Readonly<Record<string, number>>,
  thresholds: CategorySuggestionDisplayThresholds = CATEGORY_SUGGESTION_DISPLAY_THRESHOLDS,
): readonly string[] {
  const noneProbability = probabilities[CATEGORY_SUGGESTION_NONE_OUTCOME];
  if (
    choice === CATEGORY_SUGGESTION_NONE_OUTCOME ||
    noneProbability === undefined ||
    !Number.isFinite(noneProbability)
  ) {
    return [];
  }

  const rankedCategories = deduplicateCategorySuggestionCandidates(categories)
    .map((category, index) => ({
      id: category.id,
      index,
      probability: probabilities[category.id],
    }))
    .filter(
      (candidate): candidate is typeof candidate & { probability: number } =>
        Number.isFinite(candidate.probability),
    )
    .sort(
      (left, right) =>
        right.probability - left.probability || left.index - right.index,
    );

  const primary = rankedCategories[0];
  if (
    !primary ||
    primary.id !== choice ||
    primary.probability <= noneProbability ||
    primary.probability < thresholds.minimumPrimaryProbability ||
    primary.probability - noneProbability <
      thresholds.minimumPrimaryMarginOverNone
  ) {
    return [];
  }

  const selected = [primary.id];
  for (const candidate of rankedCategories.slice(1)) {
    if (selected.length >= MAX_CATEGORY_SUGGESTIONS) break;
    if (
      candidate.probability < thresholds.minimumAdditionalProbability ||
      candidate.probability - noneProbability <
        thresholds.minimumAdditionalMarginOverNone
    ) {
      break;
    }
    selected.push(candidate.id);
  }

  return selected;
}
