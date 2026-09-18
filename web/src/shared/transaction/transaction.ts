import { parseApiMoney, type ApiDataErrorFactory } from "../api/api-response";
import type { TransactionHistoryItem } from "../api/transaction-history";
import {
  resolveTransactionCategory,
  type CategoryProjection,
} from "../category";
import {
  resolveTransactionAccount,
  type StatementImportAccount,
} from "../account";
import { roundMoney } from "../money";

interface TransactionProjection {
  readonly id: string;
  readonly date: string;
  readonly description: string;
  readonly category: CategoryProjection["key"];
  readonly categoryLabel: string;
  readonly categoryColor: CategoryProjection["color"];
  readonly account: string;
  readonly amount: number;
}

const transactionDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function projectTransactionHistoryItem(
  transaction: TransactionHistoryItem,
  categoryById: ReadonlyMap<string, CategoryProjection>,
  statementImports: ReadonlyMap<string, StatementImportAccount>,
  createError: ApiDataErrorFactory,
): TransactionProjection {
  const category = resolveTransactionCategory(
    transaction.id,
    transaction.categoryId,
    categoryById,
    createError,
  );
  const account = resolveTransactionAccount(transaction, statementImports);

  return {
    id: transaction.id,
    date: transactionDateFormatter.format(
      new Date(`${transaction.purchaseDate}T00:00:00Z`),
    ),
    description: transaction.description,
    category: category.key,
    categoryLabel: category.label,
    categoryColor: category.color,
    account: account.label,
    amount: -Math.abs(
      roundMoney(
        parseApiMoney(
          transaction.amount,
          `Transaction ${transaction.id}`,
          createError,
        ),
      ),
    ),
  };
}

export { projectTransactionHistoryItem };
