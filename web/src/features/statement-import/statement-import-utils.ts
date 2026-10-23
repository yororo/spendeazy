import { normalizeCategoryRulePattern } from "@/shared/category-rule";
import type { CategorizedStatementEntry } from "./statement-categorizer";

interface CategoryLabelOption {
  readonly value: string;
  readonly label: string;
}

interface IncludedStatementEntry {
  readonly amount: number;
  readonly isExcluded: boolean;
}

interface ManualStatementEntryEdit {
  readonly expenseId: string;
  readonly entryDate: Date;
  readonly description: string;
  readonly amount: number;
  readonly categoryId: string;
}

function getStatementActivityLabel(
  expense: Pick<CategorizedStatementEntry, "amount" | "activityKind">,
): "Expense" | "Payment" | "Other credit" {
  if (expense.amount <= 0) return "Expense";
  return expense.activityKind === "payment" ? "Payment" : "Other credit";
}

function normalizeDescription(value: string) {
  return normalizeCategoryRulePattern(value);
}

function cleanDescription(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function getCategoryLabel(
  options: readonly CategoryLabelOption[],
  categoryId: string,
) {
  return (
    options.find((option) => option.value === categoryId)?.label ??
    "Unknown Category"
  );
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isIncludedStatementEntry(
  expense: IncludedStatementEntry,
) {
  return !expense.isExcluded;
}

function applyManualStatementEntryEdit<
  Entry extends {
    readonly id: string;
    readonly isExcluded: boolean;
    readonly assignment: "rule" | "manual" | "ambiguous" | "unmapped";
    readonly categoryId: string | null;
  },
>(entries: readonly Entry[], edit: ManualStatementEntryEdit): Entry[] {
  return entries.map((entry): Entry =>
    entry.id === edit.expenseId
      ? ({
          ...entry,
          entryDate: edit.entryDate,
          description: cleanDescription(edit.description),
          amount: edit.amount,
          categoryId: edit.categoryId,
          assignment: "manual" as const,
          isExcluded: entry.isExcluded || edit.amount > 0,
        } as Entry)
      : entry,
  );
}

export {
  applyManualStatementEntryEdit,
  cleanDescription,
  getCategoryLabel,
  getStatementActivityLabel,
  isIncludedStatementEntry,
  normalizeDescription,
  toDateInputValue,
};
export type { ManualStatementEntryEdit };
