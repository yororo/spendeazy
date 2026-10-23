import { parseApiMoney, type ApiDataErrorFactory } from "../api/api-response";
import type { ExpenseHistoryItem } from "../api/expense-history";
import {
  resolveExpenseCategory,
  type CategoryProjection,
} from "../category";
import {
  resolveExpenseAccount,
  type StatementImportAccount,
} from "../account";
import { roundMoney } from "../money";

interface ExpenseProjection {
  readonly id: string;
  readonly categoryId: string | null;
  readonly purchaseDate: string;
  readonly date: string;
  readonly description: string;
  readonly category: CategoryProjection["key"];
  readonly categoryLabel: string;
  readonly categoryColor: CategoryProjection["color"];
  readonly account: string;
  readonly amount: number;
  readonly source: "manual" | "imported";
  readonly statementImportId: string | null;
  readonly updatedAt?: string;
  readonly addedByUserId?: string;
  readonly deletedAt?: string;
}

const expenseDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function projectExpenseHistoryItem(
  expense: ExpenseHistoryItem,
  categoryById: ReadonlyMap<string, CategoryProjection>,
  statementImports: ReadonlyMap<string, StatementImportAccount>,
  createError: ApiDataErrorFactory,
): ExpenseProjection {
  const category = resolveExpenseCategory(
    expense.id,
    expense.categoryId,
    categoryById,
    createError,
  );
  const account = resolveExpenseAccount(expense, statementImports);

  return {
    id: expense.id,
    categoryId: expense.categoryId,
    purchaseDate: expense.purchaseDate,
    date: expenseDateFormatter.format(
      new Date(`${expense.purchaseDate}T00:00:00Z`),
    ),
    description: expense.description,
    category: category.key,
    categoryLabel: category.label,
    categoryColor: category.color,
    account: account.label,
    amount: -Math.abs(
      roundMoney(
        parseApiMoney(
          expense.amount,
          `Expense ${expense.id}`,
          createError,
        ),
      ),
    ),
    source: expense.source,
    statementImportId: expense.statementImportId,
    ...(expense.updatedAt === undefined
      ? {}
      : { updatedAt: expense.updatedAt }),
    ...(expense.addedByUserId === undefined
      ? {}
      : { addedByUserId: expense.addedByUserId }),
    ...(expense.deletedAt === undefined
      ? {}
      : { deletedAt: expense.deletedAt }),
  };
}

export { projectExpenseHistoryItem };
export type { ExpenseProjection };
