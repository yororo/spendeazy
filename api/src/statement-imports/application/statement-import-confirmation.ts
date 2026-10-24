import type { ExpenseCategoryStore } from '../../expenses/application/expense-category-store';
import type { SpaceImportedExpenseStore } from '../../expenses/application/imported-expense-store';
import type { UserStore } from '../../users/application/user-store';
import type { StatementImportStore } from './statement-import-store';
import type { ExpenseActivityStore } from '../../expenses/application/expense-activity-store';

export const STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK = Symbol(
  'STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK',
);

export type StatementImportConfirmationUserStore = Pick<UserStore, 'findById'>;

export type StatementImportConfirmationCategoryStore = Pick<
  ExpenseCategoryStore,
  'findBySpaceId'
>;

export type StatementImportConfirmationStore = Pick<
  StatementImportStore,
  'create'
>;

export type StatementImportConfirmationExpenseStore = Pick<
  SpaceImportedExpenseStore,
  'findByFingerprintInSpace' | 'findByReferenceHashInSpace' | 'create'
>;

export type StatementImportConfirmationActivityStore = Pick<
  ExpenseActivityStore,
  'create'
>;

export interface StatementImportConfirmationSpaceStore {
  lockForStatementImport(spaceId: string, userId: string): Promise<void>;
}

export interface StatementImportConfirmationContext {
  readonly users: StatementImportConfirmationUserStore;
  readonly categories: StatementImportConfirmationCategoryStore;
  readonly statementImports: StatementImportConfirmationStore;
  readonly importedExpenses: StatementImportConfirmationExpenseStore;
  readonly expenseActivities: StatementImportConfirmationActivityStore;
  readonly spaces?: StatementImportConfirmationSpaceStore;
}

export interface StatementImportConfirmationUnitOfWork {
  execute<TResult>(
    work: (context: StatementImportConfirmationContext) => Promise<TResult>,
  ): Promise<TResult>;
}
