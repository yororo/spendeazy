export const EXPENSE_ACTIVITY_STORE = Symbol('EXPENSE_ACTIVITY_STORE');

export type ExpenseActivityType = 'created' | 'edited' | 'deleted';

export interface ExpenseActivitySnapshot {
  categoryId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
}

export function toExpenseActivitySnapshot(
  expense: ExpenseActivitySnapshot,
): ExpenseActivitySnapshot {
  return {
    categoryId: expense.categoryId,
    purchaseDate: expense.purchaseDate,
    description: expense.description,
    amount: expense.amount,
  };
}

export interface ExpenseActivityRecord {
  id: string;
  expenseId: string;
  spaceId: string;
  actorUserId: string;
  type: ExpenseActivityType;
  occurredAt: Date;
  before?: ExpenseActivitySnapshot;
  after?: ExpenseActivitySnapshot;
}

export interface NewExpenseActivity {
  expenseId: string;
  spaceId: string;
  actorUserId: string;
  type: ExpenseActivityType;
  occurredAt: Date;
  before?: ExpenseActivitySnapshot;
  after?: ExpenseActivitySnapshot;
}

export interface ExpenseActivityStore {
  create(input: NewExpenseActivity): Promise<ExpenseActivityRecord>;
  findByExpenseInSpace(
    spaceId: string,
    expenseId: string,
  ): Promise<ExpenseActivityRecord[]>;
}
