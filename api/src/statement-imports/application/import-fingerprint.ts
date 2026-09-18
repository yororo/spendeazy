import { createHash } from 'node:crypto';
import { normalizeAmount } from '../../normalization/amount';
import { normalizeMatchingText } from '../../normalization/matching-text';

export interface ImportFingerprintStatementFields {
  bank: string;
  cardType?: string | null;
}

export interface ImportFingerprintTransactionFields {
  purchaseDate: string;
  description: string;
  amount: string;
}

export function computeImportFingerprint(
  statement: ImportFingerprintStatementFields,
  transaction: ImportFingerprintTransactionFields,
): string {
  const resolvedTuple = [
    'v2',
    transaction.purchaseDate,
    normalizeMatchingText(transaction.description),
    normalizeAmount(transaction.amount),
    normalizeMatchingText(statement.bank),
    statement.cardType == null
      ? null
      : normalizeMatchingText(statement.cardType),
  ];

  return createHash('sha256')
    .update(JSON.stringify(resolvedTuple))
    .digest('hex');
}
