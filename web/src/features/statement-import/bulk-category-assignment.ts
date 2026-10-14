import type { CategorizedStatementEntry } from "./statement-categorizer";
import { normalizeDescription } from "./statement-import-utils";

function isBulkAssignableExpense(expense: CategorizedStatementEntry) {
  return !expense.isExcluded && expense.amount < 0;
}

function getRepeatedStatementEntries(
  entries: readonly CategorizedStatementEntry[],
  source: CategorizedStatementEntry,
) {
  const description = normalizeDescription(source.description);
  return entries.filter(
    (expense) => normalizeDescription(expense.description) === description,
  );
}

export { getRepeatedStatementEntries, isBulkAssignableExpense };
