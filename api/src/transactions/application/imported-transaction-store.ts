export const IMPORTED_TRANSACTION_STORE = Symbol('IMPORTED_TRANSACTION_STORE');
export const SPACE_IMPORTED_TRANSACTION_STORE = Symbol(
  'SPACE_IMPORTED_TRANSACTION_STORE',
);

export interface ImportedTransactionRecord {
  id: string;
  userId: string;
  spaceId?: string;
  addedByUserId?: string;
  categoryId: string | null;
  statementImportId: string;
  purchaseDate: string;
  description: string;
  amount: string;
  categoryMatchConfidence: string | null;
  importFingerprint: string;
  source: 'imported';
  createdAt: Date;
  updatedAt: Date;
}

export interface NewImportedTransaction {
  userId: string;
  spaceId?: string;
  addedByUserId?: string;
  categoryId: string | null;
  statementImportId: string;
  purchaseDate: string;
  description: string;
  amount: string;
  categoryMatchConfidence: string | null;
  importFingerprint: string;
}

export interface UpdateImportedTransactionCategory {
  categoryId: string | null;
  expectedUpdatedAt?: string;
}

export interface UpdateImportedTransactionInput {
  categoryId: string | null;
  purchaseDate?: string;
  description?: string;
  amount?: string;
  expectedUpdatedAt?: string;
}

export interface ImportedTransactionStore {
  findByFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<ImportedTransactionRecord[]>;
  create(input: NewImportedTransaction): Promise<ImportedTransactionRecord>;
  findById(
    userId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null>;
  updateCategory(
    userId: string,
    id: string,
    input: UpdateImportedTransactionCategory,
  ): Promise<ImportedTransactionRecord | null>;
}

export interface SpaceImportedTransactionStore {
  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null>;
  updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedTransactionCategory,
  ): Promise<ImportedTransactionRecord | null>;
}
