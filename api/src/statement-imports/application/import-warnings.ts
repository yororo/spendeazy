import type {
  PrivateConfirmationPayload,
  ImportAdvisoryWarning,
} from './confirmation-payload';
import {
  warningDigest,
  warningIdentity,
} from './confirmation-canonicalization';
import { computeImportFingerprint } from './import-fingerprint';
import type { ReviewedImportContext } from './reviewed-import-unit-of-work';
export async function buildImportWarnings(
  context: Pick<
    ReviewedImportContext,
    'findFileMatches' | 'findDuplicateHistory'
  >,
  spaceId: string,
  payload: PrivateConfirmationPayload,
) {
  const warnings: ImportAdvisoryWarning[] = [];
  const add = (
    warning: Omit<ImportAdvisoryWarning, 'id'>,
    reconciliation = false,
  ) => {
    warnings.push({
      ...warning,
      id: warningIdentity(
        warning,
        reconciliation ? payload.evidence.reconciliation.diagnostics : [],
      ),
    });
  };
  const evidence = payload.evidence;
  if (
    evidence.reconciliation.status !== 'matched' ||
    evidence.reconciliation.comparisons.some(
      (comparison) =>
        comparison.difference === null ||
        BigInt(comparison.difference.replace('.', '')) !== 0n,
    ) ||
    evidence.reconciliation.diagnostics.length ||
    evidence.completeness.assessment === 'partial' ||
    evidence.pages.some(
      (page) => page.outcome === 'failed' || page.outcome === 'unreadable',
    )
  ) {
    add(
      {
        type: 'reconciliation',
        sourceRowIds: [
          ...new Set(
            evidence.reconciliation.diagnostics.flatMap(
              (item) => item.sourceRowIds,
            ),
          ),
        ].sort(),
        expenseIds: [],
        statementImportIds: [],
        message:
          'Original statement reconciliation or extraction needs review.',
      },
      true,
    );
  }
  const files = await context.findFileMatches(
    spaceId,
    payload.statement.fileHash,
  );
  if (files.length)
    add({
      type: 'exact_file',
      sourceRowIds: [],
      expenseIds: [],
      statementImportIds: files.sort(),
      message: 'This file was previously imported into this Space.',
    });
  const signals = payload.expenses.map((expense) => {
    const referenceHash = evidence.transactions.find(
      (row) => row.sourceRowId === expense.sourceRowId,
    )!.referenceHash;
    const fingerprint = computeImportFingerprint(payload.statement, expense);
    return {
      sourceRowId: expense.sourceRowId,
      fingerprint,
      referenceHash,
      key: referenceHash ?? fingerprint,
    };
  });
  const history = await context.findDuplicateHistory(
    spaceId,
    [
      ...new Set(
        signals
          .filter((row) => !row.referenceHash)
          .map((row) => row.fingerprint),
      ),
    ],
    [
      ...new Set(
        signals.flatMap((row) =>
          row.referenceHash ? [row.referenceHash] : [],
        ),
      ),
    ],
  );
  for (const key of [...new Set(signals.map((row) => row.key))].sort()) {
    const rows = signals.filter((row) => row.key === key);
    const matches = history.filter((row) =>
      rows[0].referenceHash
        ? row.referenceHash === key
        : row.importFingerprint === key,
    );
    if (rows.length > 1 || matches.length)
      add({
        type: 'probable_duplicate',
        sourceRowIds: rows.map((row) => row.sourceRowId).sort(),
        expenseIds: matches.map((row) => row.id).sort(),
        statementImportIds: [
          ...new Set(matches.map((row) => row.statementImportId)),
        ].sort(),
        message:
          'Reviewed spending resembles another imported Expense or reviewed row.',
      });
  }
  warnings.sort((a, b) => a.id.localeCompare(b.id));
  return { warnings, warningDigest: warningDigest(spaceId, payload, warnings) };
}
