import { normalizeCategoryRulePattern } from "@/shared/category-rule";

interface IncludedStatementTransaction {
  readonly amount: number;
  readonly isExcluded: boolean;
}

interface ManualTransactionEdit {
  readonly transactionId: string;
  readonly transactionDate: Date;
  readonly description: string;
  readonly amount: number;
  readonly categoryId: string;
}

function normalizeDescription(value: string) {
  return normalizeCategoryRulePattern(value);
}

function cleanDescription(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isIncludedStatementTransaction(
  transaction: IncludedStatementTransaction,
) {
  return !transaction.isExcluded;
}

function applyManualTransactionEdit<
  Transaction extends {
    readonly id: string;
    readonly isExcluded: boolean;
    readonly assignment: "rule" | "manual" | "ambiguous" | "unmapped";
    readonly categoryId: string | null;
  },
>(transactions: readonly Transaction[], edit: ManualTransactionEdit): Transaction[] {
  return transactions.map((transaction): Transaction =>
    transaction.id === edit.transactionId
      ? ({
          ...transaction,
          transactionDate: edit.transactionDate,
          description: cleanDescription(edit.description),
          amount: edit.amount,
          categoryId: edit.categoryId,
          assignment: "manual" as const,
          isExcluded: transaction.isExcluded || edit.amount > 0,
        } as Transaction)
      : transaction,
  );
}

export {
  applyManualTransactionEdit,
  cleanDescription,
  isIncludedStatementTransaction,
  normalizeDescription,
  toDateInputValue,
};
export type { ManualTransactionEdit };
