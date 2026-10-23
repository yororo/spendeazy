import { createHash } from 'node:crypto';
import { normalizeAmount } from '../../normalization/amount';
import { normalizeMatchingText } from '../../normalization/matching-text';

export interface ImportFingerprintStatementFields {
  bank: string;
  cardType?: string | null;
}

export interface ImportFingerprintExpenseFields {
  purchaseDate: string;
  description: string;
  amount: string;
}

export function computeImportFingerprint(
  statement: ImportFingerprintStatementFields,
  expense: ImportFingerprintExpenseFields,
): string {
  const resolvedTuple = [
    'v2',
    expense.purchaseDate,
    normalizeMatchingText(expense.description),
    normalizeAmount(expense.amount),
    normalizeMatchingText(statement.bank),
    statement.cardType == null
      ? null
      : normalizeMatchingText(statement.cardType),
  ];

  return createHash('sha256')
    .update(JSON.stringify(resolvedTuple))
    .digest('hex');
}
