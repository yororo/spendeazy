import type { TransactionCategoryStore } from '../../transactions/application/transaction-category-store';
import type { ImportedTransactionStore } from '../../transactions/application/imported-transaction-store';
import type { UserStore } from '../../users/application/user-store';
import type { StatementImportStore } from './statement-import-store';

export const STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK = Symbol(
  'STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK',
);

export type StatementImportConfirmationUserStore = Pick<UserStore, 'findById'>;

export type StatementImportConfirmationCategoryStore = Pick<
  TransactionCategoryStore,
  'findById'
>;

export type StatementImportConfirmationStore = Pick<
  StatementImportStore,
  'findByFileHash' | 'create'
>;

export type StatementImportConfirmationTransactionStore = Pick<
  ImportedTransactionStore,
  'findByFingerprint' | 'create'
>;

export interface StatementImportConfirmationContext {
  readonly users: StatementImportConfirmationUserStore;
  readonly categories: StatementImportConfirmationCategoryStore;
  readonly statementImports: StatementImportConfirmationStore;
  readonly importedTransactions: StatementImportConfirmationTransactionStore;
}

export interface StatementImportConfirmationUnitOfWork {
  execute<TResult>(
    work: (context: StatementImportConfirmationContext) => Promise<TResult>,
  ): Promise<TResult>;
}
