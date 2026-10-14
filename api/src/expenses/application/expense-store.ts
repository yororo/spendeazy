export const SPACE_EXPENSE_STORE = Symbol('SPACE_EXPENSE_STORE');
export const EXPENSE_DESCRIPTION_MAX_LENGTH = 500;

export type ExpenseSource = 'manual' | 'imported';
export type ExpenseCategoryState = 'categorized' | 'uncategorized';

export interface ExpenseFilters {
  fromDate?: string;
  toDate?: string;
  categoryId?: string;
  categoryState?: ExpenseCategoryState;
  statementImportId?: string;
  source?: ExpenseSource;
  description?: string;
  accountBank?: string;
  accountCardType?: string;
}

export interface ExpenseCursorPosition {
  purchaseDate: string;
  expenseId: string;
}

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
  categoryId: string | null;
  statementImportId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
  source: ExpenseSource;
  createdAt: Date;
  updatedAt: Date;
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
  categoryId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
}

export interface UpdateManualExpense {
  categoryId?: string | null;
  purchaseDate?: string;
  description?: string;
  amount?: string;
  expectedUpdatedAt?: string;
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
  findPageInSpace(
    query: SpaceExpensePageQuery,
  ): Promise<ExpenseRecord[]>;
  countInSpace(query: SpaceExpensePageQuery): Promise<number>;
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
    expectedUpdatedAt?: string,
  ): Promise<boolean>;
}
