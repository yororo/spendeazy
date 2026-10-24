import { createHash } from 'node:crypto';
import { normalizeAmount } from '../../normalization/amount';
import { normalizeMatchingText } from '../../normalization/matching-text';

export interface ImportFingerprintStatementFields {
  provider: string;
  accountFormat?: string | null;
}

export interface ImportFingerprintExpenseFields {
  expenseDate: string;
  description: string;
  amount: string;
}

export function computeImportFingerprint(
  statement: ImportFingerprintStatementFields,
  expense: ImportFingerprintExpenseFields,
): string {
  const resolvedTuple = [
    'v3',
    expense.expenseDate,
    normalizeMatchingText(expense.description),
    normalizeAmount(expense.amount),
    normalizeMatchingText(statement.provider),
    statement.accountFormat == null
      ? null
      : normalizeMatchingText(statement.accountFormat),
  ];

  return createHash('sha256')
    .update(JSON.stringify(resolvedTuple))
    .digest('hex');
}
