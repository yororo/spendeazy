import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfirmationPayload } from '../../src/statement-imports/application/confirmation-payload';

/** Synthetic envelope probes, not provider PDF/launch certification fixtures. */
export function confirmationEnvelope(
  provider: ConfirmationPayload['statement']['provider'],
  blocks = 1,
): ConfirmationPayload {
  const payload = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../mobile-app/src/features/statement-import/fixtures/confirmation.json',
      ),
      'utf8',
    ),
  ) as ConfirmationPayload;
  const rows = payload.evidence.transactions;
  const expenses = payload.expenses;
  const excluded = payload.excluded;
  payload.statement.provider = provider;
  if (provider !== 'gcash') {
    payload.statement.accountFormat = provider === 'bdo' ? 'amex' : 'visa';
    payload.statement.statementType = 'credit_card';
    payload.statement.statementDate = '2026-09-30';
    payload.statement.historyFromDate = null;
    payload.statement.historyToDate = null;
    payload.evidence.parserVersion = `${provider}/${payload.statement.accountFormat}/1`;
  }
  const sourceId = (block: number, id: string) => `block-${block}-${id}`;
  payload.evidence.transactions = Array.from({ length: blocks }, (_, block) =>
    rows.map((row, index) => {
      const copy = structuredClone(row);
      copy.sourceRowId = sourceId(block, row.sourceRowId);
      copy.sourceOrder = block * rows.length + index;
      copy.original.description += ' café';
      if (provider !== 'gcash') delete copy.duplicateReference;
      else copy.duplicateReference = `fictional-ref-${block}-${index}`;
      return copy;
    }),
  ).flat();
  payload.expenses = Array.from({ length: blocks }, (_, block) =>
    expenses.map((row) => ({
      ...row,
      sourceRowId: sourceId(block, row.sourceRowId),
      description: `${row.description} café`,
    })),
  ).flat();
  payload.excluded = Array.from({ length: blocks }, (_, block) =>
    excluded.map((row) => ({
      ...row,
      sourceRowId: sourceId(block, row.sourceRowId),
    })),
  ).flat();
  // Include acknowledgment overhead in every measurement. These are synthetic IDs,
  // not a claim that a live preview would return this duplicate set.
  payload.acknowledgedWarnings = [
    'reconciliation',
    'exact_file',
    'probable_duplicate',
  ].map((_, index) => `${index}`.repeat(64));
  payload.acknowledgedWarningDigest = 'a'.repeat(64);
  return payload;
}

export function envelopeBytes(payload: ConfirmationPayload): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}
