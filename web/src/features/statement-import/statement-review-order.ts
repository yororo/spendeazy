import type { PageScrollPosition } from "@/shared/ui";
import type { CategorizedTransaction } from "./statement-categorizer";
import { toDateInputValue } from "./statement-import-utils";

type StatementSort = "date-asc" | "date-desc" | "amount-asc" | "amount-desc";

function isStatementSort(value: string): value is StatementSort {
  return value === "date-asc" || value === "date-desc" || value === "amount-asc" || value === "amount-desc";
}

interface CategorizeView extends PageScrollPosition {
  search: string;
  dateFrom: string;
  dateTo: string;
  categoryFilter: string;
  sort: StatementSort;
}

function compareStatementRows(a: CategorizedTransaction, b: CategorizedTransaction, sort: StatementSort) {
  const difference = sort.startsWith("amount")
    ? Math.abs(a.amount) - Math.abs(b.amount)
    : toDateInputValue(a.transactionDate).localeCompare(toDateInputValue(b.transactionDate));
  return (sort.endsWith("asc") ? difference : -difference) || a.id.localeCompare(b.id);
}

export { compareStatementRows, isStatementSort };
export type { CategorizeView, StatementSort };
