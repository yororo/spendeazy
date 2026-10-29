import type { ImportResult, ImportRow } from './import-model.ts';
import type { ReviewHandoff } from './review-model.ts';
import { decimalAmount } from './values.ts';

/** Fictional cross-project golden fixture; no native/device acceptance implied. */
export function confirmationHandoff(): ReviewHandoff {
  const kinds = ['purchase', 'outgoing-transfer', 'payment', 'refund', 'cash-in', 'credit', 'unknown-direction', 'invalid-date', 'invalid-amount', 'purchase'] as const;
  const amounts = [100000n, 30000n, -500000n, -20000n, -10000n, -10000n, null, 10000n, null, 80000n];
  const rows: ImportRow[] = kinds.map((kind, index) => ({
    sourceRowId: `row-${index}`, pageIndex: 0, sourceOrder: index, description: index < 2 ? 'Fictional shop' : `Fictional activity ${index}`,
    originalDate: kind === 'invalid-date' ? '02/30/26' : '2026-09-10', date: kind === 'invalid-date' ? null : '2026-09-10',
    originalAmount: kind === 'invalid-amount' ? 'unreadable' : amounts[index] === null ? '100.00' : decimalAmount(amounts[index]!),
    reference: `fictional-ref-${index}`, signedActivityMinor: amounts[index], evidence: [{ kind: 'unresolved', value: null }],
    classification: kind === 'purchase' || kind === 'outgoing-transfer' ? { eligible: true, kind, expenseMinor: amounts[index]! } : { eligible: false, reason: kind },
  }));
  const original: ImportResult = {
    parserVersion: 'gcash/e-wallet/1', extractionEngineVersion: 'fictional-engine/1',
    owner: { userId: '7', spaceId: '8' }, draftId: 'fictional-draft', file: { name: 'fictional.pdf', byteCount: 100, sha256: 'a'.repeat(64) },
    account: { provider: 'gcash', format: 'e-wallet', statementType: 'e-wallet' },
    dates: { statementDate: null, historyPeriod: { from: '2026-09-01', to: '2026-09-30' } }, rows,
    controls: [{ key: 'debits', kind: 'total-debits', sourceLabel: 'Total Debit', originalValue: '10,000.00', amountMinor: 1000000n },
      { key: 'unreadable-control', kind: 'subtotal', originalValue: 'unreadable', amountMinor: null }],
    reconciliation: { outcome: 'mismatch', differenceMinor: -50000n,
      comparisons: [{ controlKey: 'debits', equation: 'debit-sum', expectedMinor: 1000000n, extractedMinor: 950000n, differenceMinor: -50000n }] },
    pages: [{ pageIndex: 0, outcome: 'text', hasImages: false }, { pageIndex: 1, outcome: 'failed', hasImages: false }],
    completeness: { assessment: 'partial', failedPageIndices: [1], unreadablePageIndices: [] }, recognitionEvidence: [],
    warnings: [{ code: 'reconciliation-mismatch', sourceRowIds: [], pageIndices: [] }, { code: 'partial-extraction', sourceRowIds: [], pageIndices: [1] }],
  };
  return { owner: original.owner, draftId: original.draftId, reviewRevision: 3, original,
    rows: rows.map((row, index) => ({ sourceRowId: row.sourceRowId, amount: index < 2 ? decimalAmount(amounts[index]!) : null,
      values: { expenseDate: '2026-09-10', description: row.description, amount: '1000', categoryId: index < 2 ? '42' : null },
      inclusion: index < 2 ? 'included' : row.classification.eligible ? 'user-excluded' : 'locked-excluded',
      assignment: index < 2 ? { origin: 'manual', categoryRevision: '1' } : null })),
    stagedRules: [{ localId: 'staged', pattern: 'Fictional activity 9', normalizedPattern: 'fictional activity 9', categoryId: '42', categoryRevision: '1', rulesRevision: '1', matchType: 'contains', existingRuleId: null }],
    catalog: { spaceId: '8', categories: [{ id: '42', name: 'Food', isActive: true, revision: '1', iconKey: 'coffee', colorKey: 'cocoa' }], rules: [], rulesRevision: '1' },
  };
}
