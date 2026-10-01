import type { CategorizedTransaction } from "./statement-categorizer";
import { normalizeDescription } from "./statement-import-utils";

function isBulkAssignableExpense(transaction: CategorizedTransaction) {
  return !transaction.isExcluded && transaction.amount < 0;
}

function getRepeatedStatementTransactions(
  transactions: readonly CategorizedTransaction[],
  source: CategorizedTransaction,
) {
  const description = normalizeDescription(source.description);
  return transactions.filter(
    (transaction) => normalizeDescription(transaction.description) === description,
  );
}

export { getRepeatedStatementTransactions, isBulkAssignableExpense };
