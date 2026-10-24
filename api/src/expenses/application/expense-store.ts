export const SPACE_EXPENSE_STORE = Symbol('SPACE_EXPENSE_STORE');
export const EXPENSE_DESCRIPTION_MAX_LENGTH = 500;

export type ExpenseSource = 'manual' | 'imported';
export type ExpenseSort = 'newest' | 'oldest';

export interface ExpenseFilters {
  fromDate?: string;
  toDate?: string;
  categoryId?: string;
  statementImportId?: string;
  source?: ExpenseSource;
  description?: string;
  sort?: ExpenseSort;
}

export type ExpenseCursorPosition =
  | { expenseDate: string; expenseId: string }
  | { deletedAt: string; expenseId: string };

export interface SpaceExpensePageQuery {
  spaceId: string;
  filters: ExpenseFilters;
  after: ExpenseCursorPosition | null;
  pageSize: number;
  deletedOnly?: boolean;
}

export interface ExpenseRecord {
  id: string;
  spaceId: string;
  addedByUserId: string;
  categoryId: string;
  statementImportId: string | null;
  expenseDate: string;
  description: string;
  amount: string;
  source: ExpenseSource;
  createdAt: Date;
  updatedAt: Date;
  revision: string;
  deletedAt?: Date | null;
}

export interface ManualExpenseRecord extends Omit<
  ExpenseRecord,
  'statementImportId' | 'source'
> {
  source: 'manual';
}

export interface NewManualExpense {
  spaceId: string;
  addedByUserId: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  amount: string;
}

export interface UpdateManualExpense {
  categoryId?: string;
  expenseDate?: string;
  description?: string;
  amount?: string;
  expectedRevision: string;
}

export interface SpaceExpenseStore {
  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord | null>;
  findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord | null>;
  findPageInSpace(query: SpaceExpensePageQuery): Promise<ExpenseRecord[]>;
  countInSpace(query: SpaceExpensePageQuery): Promise<number>;
  sumAmountInSpace(query: SpaceExpensePageQuery): Promise<string>;
  createInSpace(input: NewManualExpense): Promise<ManualExpenseRecord>;
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
    actorUserId: string,
  ): Promise<ManualExpenseRecord | null>;
  deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedRevision: string,
  ): Promise<boolean>;
}
