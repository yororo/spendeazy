import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type {
  CategorySuggestionCandidate,
  CategorySuggestionExample,
} from '../../src/statement-imports/application/statement-category-suggestions';
import {
  buildTypeSafeCategorySuggestionRequest,
  TYPE_SAFE_CATEGORY_SUGGESTION_MODEL,
  TYPE_SAFE_CATEGORY_SUGGESTION_TIMEOUT_MS,
} from '../../src/statement-imports/infrastructure/typesafe-category-suggestion-request';

interface EvaluationProfile {
  readonly categories: readonly CategorySuggestionCandidate[];
  readonly examples: readonly CategorySuggestionExample[];
}

interface EvaluationCase {
  readonly id: string;
  readonly profile: string;
  readonly description: string;
  readonly recording: unknown;
}

interface EvaluationSet {
  readonly model: string;
  readonly profiles: Readonly<Record<string, EvaluationProfile>>;
  readonly cases: readonly EvaluationCase[];
}

if (!process.argv.includes('--capture-live')) {
  throw new Error('Pass --capture-live to make the explicit TypeSafe evaluation calls.');
}

if (TYPE_SAFE_CATEGORY_SUGGESTION_MODEL !== 'jev-1.13.0') {
  throw new Error('The evaluation set is calibrated for jev-1.13.0.');
}

const apiKey = process.env.TYPESAFE_API_KEY?.trim();
if (!apiKey) throw new Error('TYPESAFE_API_KEY is required for capture.');

const setPath = resolve(__dirname, 'set.json');
const evaluationSet = JSON.parse(readFileSync(setPath, 'utf8')) as EvaluationSet;
const selectedCaseArgument = process.argv.find((argument) =>
  argument.startsWith('--case-id='),
);
const selectedCaseId = selectedCaseArgument?.slice('--case-id='.length);
const onlyMissingRecordings = process.argv.includes('--only-missing');
const selectedCases = selectedCaseId
  ? evaluationSet.cases.filter(({ id }) => id === selectedCaseId)
  : evaluationSet.cases;
const casesToCapture = onlyMissingRecordings
  ? selectedCases.filter(({ recording }) => recording === null)
  : selectedCases;
if (casesToCapture.length === 0) throw new Error('No evaluation case matched.');
const timeoutArgument = process.argv.find((argument) =>
  argument.startsWith('--timeout-ms='),
);
const captureTimeoutMs = timeoutArgument
  ? Number(timeoutArgument.slice('--timeout-ms='.length))
  : 15_000;
if (!Number.isInteger(captureTimeoutMs) || captureTimeoutMs < 2_500) {
  throw new Error('Evaluation timeout must be an integer of at least 2500 ms.');
}
const concurrencyArgument = process.argv.find((argument) =>
  argument.startsWith('--concurrency='),
);
const concurrency = concurrencyArgument
  ? Number(concurrencyArgument.slice('--concurrency='.length))
  : 2;
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
  throw new Error('Evaluation concurrency must be between one and three.');
}
const client = new TypeSafeClient({
  apiKey,
  defaultModel: TYPE_SAFE_CATEGORY_SUGGESTION_MODEL,
  timeout: captureTimeoutMs,
  retry: { maxRetries: 0 },
  logLevel: 'off',
});
const recordings: Record<string, unknown> = {};
let nextCaseIndex = 0;
const failures: string[] = [];
const failureTypes = new Set<string>();

function persistRecordings(): void {
  const updated = {
    ...evaluationSet,
    cases: evaluationSet.cases.map((evaluationCase) => ({
      ...evaluationCase,
      recording: recordings[evaluationCase.id] ?? evaluationCase.recording,
    })),
  };
  writeFileSync(setPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
}

async function captureWorker(): Promise<void> {
  while (nextCaseIndex < casesToCapture.length) {
    const evaluationCase = casesToCapture[nextCaseIndex++];
    const profile = evaluationSet.profiles[evaluationCase.profile];
    if (!profile) {
      failures.push(evaluationCase.id);
      continue;
    }

    try {
      const startedAt = performance.now();
      const response = await client.systemOne(
        buildTypeSafeCategorySuggestionRequest(
          evaluationCase.description,
          profile.categories,
          profile.examples,
        ),
        {
          timeout: captureTimeoutMs,
          retry: { maxRetries: 0 },
        },
      );
      const answer = response.answers.suggestedCategory;
      if (answer.type !== 'choice') throw new Error('Unexpected answer type');
      recordings[evaluationCase.id] = {
        model: response.model,
        choice: answer.choice,
        probabilities: answer.probabilities,
        latencyMs: Math.round((performance.now() - startedAt) * 10) / 10,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
      persistRecordings();
      console.log(`Captured synthetic case ${evaluationCase.id}.`);
    } catch (error) {
      failures.push(evaluationCase.id);
      failureTypes.add(
        error instanceof Error ? error.name : typeof error,
      );
    }
  }
}

async function main(): Promise<void> {
  await Promise.all(Array.from({ length: concurrency }, () => captureWorker()));
  persistRecordings();
  console.log(
    `Captured ${Object.keys(recordings).length} synthetic cases with ${TYPE_SAFE_CATEGORY_SUGGESTION_MODEL}.`,
  );
  if (failures.length > 0) {
    throw new Error(`Evaluation capture failed for ${failures.length} synthetic case(s).`);
  }
}

void main().catch(() => {
  const failureSummary = [...failureTypes].sort().join(', ') || 'unknown error';
  console.error(
    `TypeSafe evaluation capture failed (${failureSummary}). Rerun with --only-missing to retry unrecorded cases.`,
  );
  process.exitCode = 1;
});
