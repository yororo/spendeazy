export const SPACE_TRANSACTION_STORE = Symbol('SPACE_TRANSACTION_STORE');
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
  description?: string;
  accountBank?: string;
  accountCardType?: string;
}

export interface TransactionCursorPosition {
  purchaseDate: string;
  transactionId: string;
}

export interface SpaceTransactionPageQuery {
  spaceId: string;
  filters: TransactionFilters;
  after: TransactionCursorPosition | null;
  pageSize: number;
  deletedOnly?: boolean;
}

export interface TransactionRecord {
  id: string;
  spaceId: string;
  addedByUserId: string;
  categoryId: string | null;
  statementImportId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
  source: TransactionSource;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface ManualTransactionRecord extends Omit<
  TransactionRecord,
  'statementImportId' | 'source'
> {
  source: 'manual';
}

export interface NewManualTransaction {
  spaceId: string;
  addedByUserId: string;
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
  expectedUpdatedAt?: string;
}

export interface SpaceTransactionStore {
  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualTransactionRecord | null>;
  findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualTransactionRecord | null>;
  findPageInSpace(
    query: SpaceTransactionPageQuery,
  ): Promise<TransactionRecord[]>;
  countInSpace(query: SpaceTransactionPageQuery): Promise<number>;
  createInSpace(input: NewManualTransaction): Promise<ManualTransactionRecord>;
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
    actorUserId: string,
  ): Promise<ManualTransactionRecord | null>;
  deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean>;
}
