export const SPACE_IMPORTED_TRANSACTION_STORE = Symbol(
  'SPACE_IMPORTED_TRANSACTION_STORE',
);

export interface ImportedTransactionRecord {
  id: string;
  spaceId: string;
  addedByUserId: string;
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
  deletedAt?: Date | null;
}

export interface NewImportedTransaction {
  spaceId: string;
  addedByUserId: string;
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
  categoryId?: string | null;
  purchaseDate?: string;
  description?: string;
  amount?: string;
  expectedUpdatedAt?: string;
}

export interface SpaceImportedTransactionStore {
  create(input: NewImportedTransaction): Promise<ImportedTransactionRecord>;
  findByFingerprintInSpace(
    spaceId: string,
    fingerprint: string,
  ): Promise<ImportedTransactionRecord[]>;
  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null>;
  findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null>;
  updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedTransactionCategory,
    actorUserId: string,
  ): Promise<ImportedTransactionRecord | null>;
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedTransactionInput,
    actorUserId: string,
  ): Promise<ImportedTransactionRecord | null>;
  deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean>;
}
