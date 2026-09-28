import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CategorySuggestionCandidate,
  CategorySuggestionDistribution,
} from '../../src/statement-imports/application/statement-category-suggestions';
import type { CategorySuggestionDisplayThresholds } from '../../src/statement-imports/application/category-suggestion-display-policy';
import { rankCategorySuggestionIds } from '../../src/statement-imports/application/category-suggestion-display-policy';
import { TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS } from '../../src/statement-imports/infrastructure/typesafe-category-suggestion-request';

interface EvaluationProfile {
  readonly spaceType: 'personal' | 'shared';
  readonly provider: string;
  readonly evidence: string;
  readonly categories: readonly CategorySuggestionCandidate[];
  readonly examples: readonly { categoryId: string; description: string }[];
}

interface Recording extends CategorySuggestionDistribution {
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

interface EvaluationCase {
  readonly id: string;
  readonly profile: string;
  readonly language: string;
  readonly tags: readonly string[];
  readonly goldCategoryId: string | null;
  readonly recording: Recording | null;
}

interface EvaluationSet {
  readonly cases: readonly EvaluationCase[];
  readonly profiles: Readonly<Record<string, EvaluationProfile>>;
  readonly pricing: {
    readonly currency: string;
    readonly inputUsdPerMillionTokens: number;
    readonly outputUsdPerMillionTokens: number;
    readonly effectiveDate: string;
  };
}

interface SuggestionOutcome {
  readonly evaluationCase: EvaluationCase;
  readonly suggestionIds: readonly string[];
}

const setPath = resolve(__dirname, 'set.json');
const evaluationSet = JSON.parse(
  readFileSync(setPath, 'utf8'),
) as EvaluationSet;
const recordedCases = evaluationSet.cases.filter(
  (evaluationCase) => evaluationCase.recording !== null,
);
if (recordedCases.length === 0)
  throw new Error('No model recordings are available.');

const primaryProbabilities = [
  0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75,
  0.8, 0.85, 0.9, 0.95, 0.975, 0.99, 0.995, 1,
];
const primaryMargins = [
  0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 0.9, 0.95,
  0.99, 1,
];
const additionalProbabilities = [0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3];
const additionalMargins = [0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2];

function evaluate(
  thresholds: CategorySuggestionDisplayThresholds,
): readonly SuggestionOutcome[] {
  return evaluationSet.cases.map((evaluationCase) => {
    const profile = evaluationSet.profiles[evaluationCase.profile];
    const recording = evaluationCase.recording;
    if (!profile) throw new Error('Evaluation data is incomplete.');

    return {
      evaluationCase,
      suggestionIds:
        !recording ||
        recording.latencyMs > TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS
          ? []
          : rankCategorySuggestionIds(
              profile.categories,
              recording.choice,
              recording.probabilities,
              thresholds,
            ),
    };
  });
}

function metrics(outcomes: readonly SuggestionOutcome[]) {
  const supported = outcomes.filter(
    ({ evaluationCase }) => evaluationCase.goldCategoryId !== null,
  );
  const unsupported = outcomes.filter(
    ({ evaluationCase }) => evaluationCase.goldCategoryId === null,
  );
  const shownSupported = supported.filter(
    ({ suggestionIds }) => suggestionIds.length > 0,
  );
  const topOneCorrect = supported.filter(
    ({ evaluationCase, suggestionIds }) =>
      suggestionIds[0] === evaluationCase.goldCategoryId,
  ).length;
  const topThreeCorrect = supported.filter(
    ({ evaluationCase, suggestionIds }) =>
      suggestionIds.includes(evaluationCase.goldCategoryId ?? ''),
  ).length;
  const correctDisplayedSuggestions = outcomes.reduce(
    (count, { evaluationCase, suggestionIds }) =>
      count +
      suggestionIds.filter(
        (categoryId) => categoryId === evaluationCase.goldCategoryId,
      ).length,
    0,
  );
  const totalDisplayedSuggestions = outcomes.reduce(
    (count, { suggestionIds }) => count + suggestionIds.length,
    0,
  );
  const suppressedUnsupported = unsupported.filter(
    ({ suggestionIds }) => suggestionIds.length === 0,
  ).length;
  const latencies = evaluationSet.cases
    .map(({ recording }) =>
      Math.min(
        recording?.latencyMs ?? TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
        TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
      ),
    )
    .sort((left, right) => left - right);
  const modelResponseLatencies = recordedCases
    .map(({ recording }) => recording?.latencyMs ?? 0)
    .sort((left, right) => left - right);
  const applicationTimeoutCount = evaluationSet.cases.filter(
    ({ recording }) =>
      recording === null ||
      recording.latencyMs > TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
  ).length;
  const capturedResponsesOverApplicationTimeout = recordedCases.filter(
    ({ recording }) =>
      recording !== null &&
      recording.latencyMs > TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
  ).length;
  const inputTokens = recordedCases.reduce(
    (sum, { recording }) => sum + (recording?.inputTokens ?? 0),
    0,
  );
  const outputTokens = recordedCases.reduce(
    (sum, { recording }) => sum + (recording?.outputTokens ?? 0),
    0,
  );

  return {
    topOneAccuracy: ratio(topOneCorrect, supported.length),
    topOneAccuracyWhenShown: ratio(topOneCorrect, shownSupported.length),
    topThreeAccuracy: ratio(topThreeCorrect, supported.length),
    suggestionCoverage: ratio(shownSupported.length, supported.length),
    suppressionCoverage: ratio(suppressedUnsupported, unsupported.length),
    wrongSuggestionRate: ratio(
      totalDisplayedSuggestions - correctDisplayedSuggestions,
      totalDisplayedSuggestions,
    ),
    suggestionItemPrecision: ratio(
      correctDisplayedSuggestions,
      totalDisplayedSuggestions,
    ),
    outcomesByCount: {
      zero: outcomes.filter(({ suggestionIds }) => suggestionIds.length === 0)
        .length,
      one: outcomes.filter(({ suggestionIds }) => suggestionIds.length === 1)
        .length,
      two: outcomes.filter(({ suggestionIds }) => suggestionIds.length === 2)
        .length,
      three: outcomes.filter(({ suggestionIds }) => suggestionIds.length === 3)
        .length,
    },
    counts: {
      captured: recordedCases.length,
      total: evaluationSet.cases.length,
      supported: supported.length,
      unsupported: unsupported.length,
      applicationTimeoutOrUnavailable: applicationTimeoutCount,
      capturedResponsesOverApplicationTimeout,
    },
    applicationRequestLatencyMs: {
      mean: rounded(mean(latencies)),
      median: rounded(percentile(latencies, 0.5)),
      p95: rounded(percentile(latencies, 0.95)),
    },
    modelResponseLatencyMs: {
      capturedResponses: modelResponseLatencies.length,
      mean: rounded(mean(modelResponseLatencies)),
      median: rounded(percentile(modelResponseLatencies, 0.5)),
      p95: rounded(percentile(modelResponseLatencies, 0.95)),
    },
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: rounded(
        (inputTokens * evaluationSet.pricing.inputUsdPerMillionTokens +
          outputTokens * evaluationSet.pricing.outputUsdPerMillionTokens) /
          1_000_000,
        8,
      ),
    },
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : rounded(numerator / denominator);
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(
  sortedValues: readonly number[],
  percentileValue: number,
): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(
    0,
    Math.ceil(percentileValue * sortedValues.length) - 1,
  );
  return sortedValues[index] ?? 0;
}

function rounded(value: number, decimalPlaces = 4): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

function allThresholds(): CategorySuggestionDisplayThresholds[] {
  const thresholds: CategorySuggestionDisplayThresholds[] = [];
  for (const primaryProbability of primaryProbabilities) {
    for (const primaryMargin of primaryMargins) {
      for (const additionalProbability of additionalProbabilities) {
        for (const additionalMargin of additionalMargins) {
          thresholds.push({
            minimumPrimaryProbability: primaryProbability,
            minimumPrimaryMarginOverNone: primaryMargin,
            minimumAdditionalProbability: additionalProbability,
            minimumAdditionalMarginOverNone: additionalMargin,
          });
        }
      }
    }
  }
  return thresholds;
}

function canDisplayThreeSuggestions(
  thresholds: CategorySuggestionDisplayThresholds,
): boolean {
  const primaryFloor = Math.max(
    thresholds.minimumPrimaryProbability,
    thresholds.minimumPrimaryMarginOverNone,
  );
  const additionalFloor = Math.max(
    thresholds.minimumAdditionalProbability,
    thresholds.minimumAdditionalMarginOverNone,
  );
  return primaryFloor + 2 * additionalFloor <= 1;
}

const allPolicyThresholds = allThresholds();
const eligiblePolicyThresholds = allPolicyThresholds.filter(
  canDisplayThreeSuggestions,
);
const candidates = eligiblePolicyThresholds.map((thresholds) => {
  const resultMetrics = metrics(evaluate(thresholds));
  const meetsQualityTargets =
    (resultMetrics.topOneAccuracyWhenShown ?? 0) >= 0.95 &&
    (resultMetrics.suppressionCoverage ?? 0) >= 0.8 &&
    (resultMetrics.suggestionItemPrecision ?? 0) >= 0.8 &&
    (resultMetrics.suggestionCoverage ?? 0) >= 0.5;
  return { thresholds, metrics: resultMetrics, meetsQualityTargets };
});

const mostSuppressiveCandidates = [...candidates]
  .sort(
    (left, right) =>
      (right.metrics.suppressionCoverage ?? 0) -
        (left.metrics.suppressionCoverage ?? 0) ||
      (right.metrics.topOneAccuracyWhenShown ?? 0) -
        (left.metrics.topOneAccuracyWhenShown ?? 0) ||
      (right.metrics.topThreeAccuracy ?? 0) -
        (left.metrics.topThreeAccuracy ?? 0) ||
      (right.metrics.suggestionCoverage ?? 0) -
        (left.metrics.suggestionCoverage ?? 0),
  )
  .slice(0, 5);

const compareCandidates = (
  left: (typeof candidates)[number],
  right: (typeof candidates)[number],
): number =>
  Number(right.meetsQualityTargets) - Number(left.meetsQualityTargets) ||
  (right.metrics.topThreeAccuracy ?? 0) -
    (left.metrics.topThreeAccuracy ?? 0) ||
  (right.metrics.topOneAccuracyWhenShown ?? 0) -
    (left.metrics.topOneAccuracyWhenShown ?? 0) ||
  (left.metrics.wrongSuggestionRate ?? 1) -
    (right.metrics.wrongSuggestionRate ?? 1) ||
  (right.metrics.suppressionCoverage ?? 0) -
    (left.metrics.suppressionCoverage ?? 0) ||
  (right.metrics.suggestionItemPrecision ?? 0) -
    (left.metrics.suggestionItemPrecision ?? 0) ||
  (right.metrics.suggestionCoverage ?? 0) -
    (left.metrics.suggestionCoverage ?? 0) ||
  right.thresholds.minimumPrimaryProbability -
    left.thresholds.minimumPrimaryProbability ||
  right.thresholds.minimumPrimaryMarginOverNone -
    left.thresholds.minimumPrimaryMarginOverNone ||
  right.thresholds.minimumAdditionalProbability -
    left.thresholds.minimumAdditionalProbability ||
  right.thresholds.minimumAdditionalMarginOverNone -
    left.thresholds.minimumAdditionalMarginOverNone;

candidates.sort(compareCandidates);
const best = candidates[0];
if (!best) throw new Error('No display threshold candidates were evaluated.');

const coverageByTag = Object.fromEntries(
  [...new Set(recordedCases.flatMap(({ tags }) => tags))]
    .sort()
    .map((tag) => [
      tag,
      recordedCases.filter(({ tags }) => tags.includes(tag)).length,
    ]),
);
const coverageByProfile = Object.fromEntries(
  Object.entries(evaluationSet.profiles).map(([profileId, profile]) => [
    profileId,
    {
      spaceType: profile.spaceType,
      provider: profile.provider,
      examples: profile.examples.length,
      capturedCases: recordedCases.filter(
        ({ profile: caseProfile }) => caseProfile === profileId,
      ).length,
    },
  ]),
);
const unsupportedModelOutcomes = recordedCases
  .filter(({ goldCategoryId }) => goldCategoryId === null)
  .map((evaluationCase) => {
    const recording = evaluationCase.recording;
    if (!recording) throw new Error('Evaluation data is incomplete.');
    return {
      caseId: evaluationCase.id,
      choice: recording.choice,
      choiceProbability: recording.probabilities[recording.choice],
      noneProbability: recording.probabilities.none_of_the_above,
    };
  });

console.log(
  JSON.stringify(
    {
      selectionMethod: {
        gridCandidates: candidates.length,
        excludedPolicies: allPolicyThresholds.length - candidates.length,
        everyEligiblePolicyCanDisplayThree: true,
        qualityTargets: {
          shownTopOneAccuracyAtLeast: 0.95,
          suppressionCoverageAtLeast: 0.8,
          suggestionItemPrecisionAtLeast: 0.8,
          supportedCaseCoverageAtLeast: 0.5,
        },
        tieBreak: [
          'top-three accuracy',
          'shown top-one accuracy',
          'lower wrong-suggestion rate',
          'suppression coverage',
          'suggestion item precision',
          'supported-case coverage',
        ],
        metQualityTargets: best.meetsQualityTargets,
      },
      selectedThresholds: best.thresholds,
      selectedMetrics: best.metrics,
      coverageByProfile,
      coverageByTag,
      unsupportedModelOutcomes,
      nextBestCandidates: candidates
        .slice(0, 5)
        .map(({ thresholds, metrics: resultMetrics, meetsQualityTargets }) => ({
          thresholds,
          meetsQualityTargets,
          topOneAccuracyWhenShown: resultMetrics.topOneAccuracyWhenShown,
          topThreeAccuracy: resultMetrics.topThreeAccuracy,
          suggestionCoverage: resultMetrics.suggestionCoverage,
          suppressionCoverage: resultMetrics.suppressionCoverage,
          wrongSuggestionRate: resultMetrics.wrongSuggestionRate,
          outcomesByCount: resultMetrics.outcomesByCount,
        })),
      mostSuppressiveCandidates: mostSuppressiveCandidates.map(
        ({ thresholds, metrics: resultMetrics }) => ({
          thresholds,
          topOneAccuracy: resultMetrics.topOneAccuracy,
          topOneAccuracyWhenShown: resultMetrics.topOneAccuracyWhenShown,
          topThreeAccuracy: resultMetrics.topThreeAccuracy,
          suggestionCoverage: resultMetrics.suggestionCoverage,
          suppressionCoverage: resultMetrics.suppressionCoverage,
          wrongSuggestionRate: resultMetrics.wrongSuggestionRate,
          outcomesByCount: resultMetrics.outcomesByCount,
        }),
      ),
    },
    null,
    2,
  ),
);
