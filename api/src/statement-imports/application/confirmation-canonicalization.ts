import { createHash } from 'node:crypto';
import { normalizeMatchingText } from '../../normalization/matching-text';
import type { GCashReferenceHasher } from './gcash-reference-hasher';
import type {
  ConfirmationPayload,
  ImportAdvisoryWarning,
  PrivateConfirmationPayload,
} from './confirmation-payload';

/** Must receive validated input. Raw duplicate references never enter a persistent hash. */
export function protectConfirmationReferences(
  payload: ConfirmationPayload,
  spaceId: string,
  hasher: GCashReferenceHasher,
): PrivateConfirmationPayload {
  const copy = structuredClone(payload);
  const transactions = copy.evidence.transactions.map((row) => {
    const { duplicateReference, ...evidence } = row;
    return {
      ...evidence,
      referenceHash:
        duplicateReference === undefined
          ? null
          : hasher.hash({
              spaceId,
              provider: copy.statement.provider,
              reference: duplicateReference,
            }),
    };
  });
  return { ...copy, evidence: { ...copy.evidence, transactions } };
}

/** v1: sorted object keys; explicit nulls; source arrays retain order; sets sort. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  if (value === undefined) throw new Error('Undefined is not canonical JSON');
  return JSON.stringify(value);
}

function normalizedContent(payload: PrivateConfirmationPayload) {
  const content = structuredClone({
    statement: payload.statement,
    evidence: payload.evidence,
    expenses: payload.expenses,
    excluded: payload.excluded,
    rememberedRules: payload.rememberedRules,
  });
  return {
    ...content,
    expenses: content.expenses.map((row) => ({
      ...row,
      description: row.description.trim(),
    })),
    excluded: content.excluded.toSorted((a, b) =>
      compareCanonical(a.sourceRowId, b.sourceRowId),
    ),
    rememberedRules: content.rememberedRules
      .map((rule) => ({
        ...rule,
        pattern: normalizeMatchingText(rule.pattern),
      }))
      .toSorted((a, b) => compareCanonical(a, b)),
  };
}

function compareCanonical(a: unknown, b: unknown): number {
  const left = canonicalJson(a);
  const right = canonicalJson(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
function hash(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

export function warningIdentity(
  warning: Omit<ImportAdvisoryWarning, 'id' | 'message'>,
  diagnostics: readonly {
    code: string;
    sourceRowIds: readonly string[];
    pageIndices: readonly number[];
  }[] = [],
): string {
  return hash({
    version: 1,
    diagnostics: diagnostics
      .map((item) => ({
        code: item.code,
        sourceRowIds: item.sourceRowIds.toSorted(),
        pageIndices: item.pageIndices.toSorted((a, b) => a - b),
      }))
      .toSorted(compareCanonical),
    ...warning,
    sourceRowIds: warning.sourceRowIds.toSorted(),
    expenseIds: warning.expenseIds.toSorted(),
    statementImportIds: warning.statementImportIds.toSorted(),
  });
}

export function warningDigest(
  spaceId: string,
  payload: PrivateConfirmationPayload,
  warnings: ImportAdvisoryWarning[],
): string {
  return hash({
    version: 1,
    spaceId,
    content: normalizedContent(payload),
    warnings: warnings
      .map((warning) => ({
        id: warning.id,
        type: warning.type,
        sourceRowIds: warning.sourceRowIds.toSorted(),
        expenseIds: warning.expenseIds.toSorted(),
        statementImportIds: warning.statementImportIds.toSorted(),
      }))
      .toSorted(compareCanonical),
  });
}

export function confirmationRequestHash(
  spaceId: string,
  payload: PrivateConfirmationPayload,
): string {
  return hash({
    version: 1,
    spaceId,
    content: normalizedContent(payload),
    acknowledgedWarnings: payload.acknowledgedWarnings.toSorted(),
    acknowledgedWarningDigest: payload.acknowledgedWarningDigest,
  });
}
