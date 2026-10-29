import type { ConfirmationPayload, EvidenceTransaction } from './confirmation-contract.ts';
import type { ReviewHandoff } from './review-model.ts';
import { decimalAmount } from './values.ts';

const diagnostics = {
  'partial-extraction': 'Some pages or rows could not be extracted.',
  'uncertain-completeness': 'Extraction completeness has not been verified.',
  'unresolved-classification': 'Some activity could not be classified.',
  'reconciliation-mismatch': 'Original activity differs from statement controls.',
  'missing-control': 'An original control or comparison is unavailable.',
} as const;

/** Explicit wire boundary: never JSON.stringify the local bigint review model. */
export function serializeConfirmation(handoff: ReviewHandoff, acknowledgment: Readonly<{ ids: readonly string[]; digest: string | null }> = { ids: [], digest: null }): ConfirmationPayload {
  const original = handoff.original;
  if (handoff.owner.userId !== original.owner.userId || handoff.owner.spaceId !== original.owner.spaceId || handoff.draftId !== original.draftId || handoff.catalog.spaceId !== handoff.owner.spaceId) fail();
  if (!original.parserVersion || !original.extractionEngineVersion || !original.reconciliation.comparisons) fail();
  const reviewed = new Map(handoff.rows.map(row => [row.sourceRowId, row]));
  const sourceIds = new Set(original.rows.map(row => row.sourceRowId));
  if (reviewed.size !== handoff.rows.length || sourceIds.size !== original.rows.length || reviewed.size !== sourceIds.size || [...reviewed.keys()].some(id => !sourceIds.has(id))) fail();
  const expenses: ConfirmationPayload['expenses'] = [];
  const excluded: ConfirmationPayload['excluded'] = [];
  const transactions: EvidenceTransaction[] = original.rows.map(source => {
    const row = reviewed.get(source.sourceRowId)!;
    const classification = (source.classification.eligible ? source.classification.kind : source.classification.reason).replaceAll('-', '_') as EvidenceTransaction['classification'];
    if (row.inclusion === 'included') {
      if (!source.classification.eligible || !row.amount || !row.values.categoryId || !row.assignment) fail();
      expenses.push({ sourceRowId: source.sourceRowId, expenseDate: row.values.expenseDate, description: row.values.description.trim(), amount: row.amount!, categoryId: row.values.categoryId! });
    } else {
      if (!source.classification.eligible && row.inclusion !== 'locked-excluded') fail();
      excluded.push({ sourceRowId: source.sourceRowId, reason: source.classification.eligible ? 'manual' : classification, automatic: !source.classification.eligible });
    }
    let matchingSource: EvidenceTransaction['matchingSource'] = 'unmapped';
    if (row.assignment?.origin === 'manual') matchingSource = 'manual';
    if (row.assignment?.origin === 'rule') {
      // The mode was resolved from catalog/staged Rules when this assignment was
      // applied. A later Rule deletion must not invalidate the reviewed choice.
      matchingSource = row.assignment.matchType;
    }
    return {
      sourceRowId: source.sourceRowId, pageIndex: source.pageIndex, sourceOrder: source.sourceOrder,
      original: { dateText: source.originalDate, postingDateText: source.originalPostingDate ?? null, description: source.description, amountText: source.originalAmount, balanceText: source.originalBalance ?? null },
      normalized: { date: source.date, amount: source.signedActivityMinor === null ? null : decimalAmount(source.signedActivityMinor) },
      classification, classificationEvidence: source.evidence.map(item => ({ ...item })), matchingSource,
      ...(original.account.provider === 'gcash' && source.reference !== null ? { duplicateReference: source.reference } : {}),
    };
  });
  if (!expenses.length) fail();
  const wallet = original.account.provider === 'gcash';
  return {
    statement: { fileName: original.file.name, fileHash: original.file.sha256, provider: original.account.provider, accountFormat: wallet ? 'wallet' : original.account.format as 'amex' | 'visa', statementType: wallet ? 'e_wallet' : 'credit_card', statementDate: original.dates.statementDate, historyFromDate: original.dates.historyPeriod?.from ?? null, historyToDate: original.dates.historyPeriod?.to ?? null },
    evidence: {
      parserVersion: original.parserVersion, extractionEngineVersion: original.extractionEngineVersion,
      transactions,
      controlTotals: original.controls.map(control => ({ key: control.key, label: control.sourceLabel ?? control.kind, originalText: control.originalValue, amount: control.amountMinor === null ? null : decimalAmount(control.amountMinor) })),
      reconciliation: { status: original.reconciliation.outcome === 'mismatch' ? 'warning' : original.reconciliation.outcome,
        comparisons: original.reconciliation.comparisons.map(comparison => ({ controlKey: comparison.controlKey, equation: comparison.equation, expectedAmount: comparison.expectedMinor === null ? null : decimalAmount(comparison.expectedMinor), extractedAmount: comparison.extractedMinor === null ? null : decimalAmount(comparison.extractedMinor), difference: comparison.differenceMinor === null ? null : decimalAmount(comparison.differenceMinor) })),
        diagnostics: original.warnings.map(warning => ({ code: warning.code, message: diagnostics[warning.code], sourceRowIds: [...warning.sourceRowIds], pageIndices: [...warning.pageIndices] })),
      },
      pages: original.pages.map(page => ({ pageIndex: page.pageIndex, outcome: page.outcome, hasImages: page.hasImages })),
      completeness: { assessment: original.completeness.assessment, failedPageIndices: [...original.completeness.failedPageIndices], unreadablePageIndices: [...original.completeness.unreadablePageIndices] },
    },
    expenses, excluded,
    rememberedRules: handoff.stagedRules.map(rule => ({ pattern: rule.pattern.trim().replace(/\s+/gu, ' '), matchType: rule.matchType, categoryId: rule.categoryId })),
    acknowledgedWarnings: [...acknowledgment.ids], acknowledgedWarningDigest: acknowledgment.digest,
  };
}

function fail(): never { throw new Error('The reviewed import is incomplete. Return to review.'); }
