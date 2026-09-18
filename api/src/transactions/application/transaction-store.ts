export const TRANSACTION_STORE = Symbol('TRANSACTION_STORE');
export const TRANSACTION_DESCRIPTION_MAX_LENGTH = 500;

export type TransactionSource = 'manual' | 'imported';
export type TransactionCategoryState = 'categorized' | 'uncategorized';

export interface TransactionFilters {
  fromDate?: string;
  toDate?: string;
  categoryId?: string;
  categoryState?: TransactionCategoryState;
  statementImportId?: string;
  source?: TransactionSource;
}

export interface TransactionCursorPosition {
  purchaseDate: string;
  transactionId: string;
}

export interface TransactionPageQuery {
  userId: string;
  filters: TransactionFilters;
  after: TransactionCursorPosition | null;
  pageSize: number;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  categoryId: string | null;
  statementImportId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
  source: TransactionSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManualTransactionRecord extends Omit<
  TransactionRecord,
  'statementImportId' | 'source'
> {
  source: 'manual';
}

export interface NewManualTransaction {
  userId: string;
  categoryId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
}

export interface UpdateManualTransaction {
  categoryId?: string | null;
  purchaseDate?: string;
  description?: string;
  amount?: string;
}

export interface TransactionStore {
  findById(userId: string, id: string): Promise<ManualTransactionRecord | null>;
  findPage(query: TransactionPageQuery): Promise<TransactionRecord[]>;
  create(input: NewManualTransaction): Promise<ManualTransactionRecord>;
  update(
    userId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | null>;
  delete(userId: string, id: string): Promise<boolean>;
}
