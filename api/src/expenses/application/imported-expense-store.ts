export const SPACE_IMPORTED_EXPENSE_STORE = Symbol(
  'SPACE_IMPORTED_EXPENSE_STORE',
);

export interface ImportedExpenseRecord {
  id: string;
  spaceId: string;
  addedByUserId: string;
  categoryId: string;
  statementImportId: string;
  sourceRowId: string | null;
  expenseDate: string;
  description: string;
  amount: string;
  importFingerprint: string;
  referenceHash?: string | null;
  source: 'imported';
  createdAt: Date;
  updatedAt: Date;
  revision: string;
  deletedAt?: Date | null;
  deletedByUserId?: string | null;
  deletedFromRevision?: string | null;
}

export interface NewImportedExpense {
  spaceId: string;
  addedByUserId: string;
  categoryId: string;
  statementImportId: string;
  sourceRowId: string;
  expenseDate: string;
  description: string;
  amount: string;
  importFingerprint: string;
  referenceHash?: string | null;
}

export interface UpdateImportedExpenseCategory {
  categoryId: string;
  expectedRevision: string;
}

export interface UpdateImportedExpenseInput {
  categoryId?: string;
  expenseDate?: string;
  description?: string;
  amount?: string;
  expectedRevision: string;
}

export interface SpaceImportedExpenseStore {
  create(input: NewImportedExpense): Promise<ImportedExpenseRecord>;
  findByFingerprintInSpace(
    spaceId: string,
    fingerprint: string,
  ): Promise<ImportedExpenseRecord[]>;
  findByReferenceHashInSpace(
    spaceId: string,
    referenceHash: string,
  ): Promise<ImportedExpenseRecord[]>;
  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedExpenseRecord | null>;
  findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedExpenseRecord | null>;
  updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedExpenseCategory,
    actorUserId: string,
  ): Promise<ImportedExpenseRecord | null>;
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedExpenseInput,
    actorUserId: string,
  ): Promise<ImportedExpenseRecord | null>;
  deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedRevision: string,
  ): Promise<boolean>;
}
