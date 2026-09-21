import { Inject, Injectable } from '@nestjs/common';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { StaleEditError } from '../../errors/application-error';
import { normalizeAmount } from '../../normalization/amount';
import {
  TRANSACTION_CATEGORY_STORE,
  type TransactionCategoryStore,
} from './transaction-category-store';
import { TransactionNotFoundError } from './transaction-errors';
import { ImportedTransactionImmutableError } from './transaction-errors';
import {
  IMPORTED_TRANSACTION_STORE,
  SPACE_IMPORTED_TRANSACTION_STORE,
  type ImportedTransactionRecord,
  type ImportedTransactionStore,
  type SpaceImportedTransactionStore,
} from './imported-transaction-store';
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from './transaction-cursor';
import {
  SPACE_TRANSACTION_STORE,
  TRANSACTION_STORE,
  type ManualTransactionRecord,
  type NewManualTransaction,
  type SpaceTransactionStore,
  type SpaceTransactionPageQuery,
  type TransactionFilters,
  type TransactionRecord,
  type TransactionStore,
  type UpdateManualTransaction,
} from './transaction-store';

export const DEFAULT_TRANSACTION_PAGE_SIZE = 20;
export const MAX_TRANSACTION_PAGE_SIZE = 100;

const EMPTY_IMPORTED_TRANSACTION_STORE: ImportedTransactionStore = {
  findByFingerprint: () => Promise.resolve([]),
  create: () =>
    Promise.reject(new Error('Imported transaction store is not configured')),
  findById: () => Promise.resolve(null),
  updateCategory: () => Promise.resolve(null),
};

const SPACE_STORE_NOT_CONFIGURED =
  'Space transaction persistence is not configured';

const EMPTY_SPACE_TRANSACTION_STORE: SpaceTransactionStore = {
  findByIdInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findPageInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  createInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  deleteInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

const EMPTY_SPACE_IMPORTED_TRANSACTION_STORE: SpaceImportedTransactionStore = {
  findByFingerprintInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByIdInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateCategoryInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

export interface ListTransactionsInput extends TransactionFilters {
  cursor?: string;
  pageSize?: number;
}

export interface TransactionPage {
  items: TransactionRecord[];
  nextCursor: string | null;
}

export interface CreateManualTransactionInput extends Omit<
  NewManualTransaction,
  'userId' | 'spaceId' | 'addedByUserId' | 'categoryId'
> {
  categoryId?: string | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(TRANSACTION_STORE)
    private readonly transactionStore: TransactionStore,
    @Inject(TRANSACTION_CATEGORY_STORE)
    private readonly categoryStore: TransactionCategoryStore,
    @Inject(IMPORTED_TRANSACTION_STORE)
    private readonly importedTransactionStore: ImportedTransactionStore = EMPTY_IMPORTED_TRANSACTION_STORE,
    @Inject(SPACE_TRANSACTION_STORE)
    private readonly spaceTransactionStore: SpaceTransactionStore = EMPTY_SPACE_TRANSACTION_STORE,
    @Inject(SPACE_IMPORTED_TRANSACTION_STORE)
    private readonly spaceImportedTransactionStore: SpaceImportedTransactionStore = EMPTY_SPACE_IMPORTED_TRANSACTION_STORE,
  ) {}

  async createManualTransactionInSpace(
    userId: string,
    spaceId: string,
    input: CreateManualTransactionInput,
  ): Promise<ManualTransactionRecord> {
    const categoryId = input.categoryId ?? null;
    if (categoryId !== null) {
      await this.ensureActiveCategoryInSpace(spaceId, categoryId);
    }

    return this.spaceTransactionStore.createInSpace({
      userId,
      spaceId,
      addedByUserId: userId,
      categoryId,
      purchaseDate: input.purchaseDate,
      description: normalizeDescription(input.description),
      amount: normalizeAmount(input.amount),
    });
  }

  async getManualTransactionInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualTransactionRecord> {
    const transaction = await this.spaceTransactionStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (!transaction) {
      throw new TransactionNotFoundError();
    }

    return transaction;
  }

  async listTransactionsInSpace(
    spaceId: string,
    input: ListTransactionsInput,
  ): Promise<TransactionPage> {
    const {
      cursor,
      pageSize = DEFAULT_TRANSACTION_PAGE_SIZE,
      ...filters
    } = input;
    const after =
      cursor !== undefined
        ? decodeTransactionCursor(cursor, filters).position
        : null;
    const query: SpaceTransactionPageQuery = {
      spaceId,
      filters,
      after,
      pageSize,
    };
    return toTransactionPage(
      await this.spaceTransactionStore.findPageInSpace(query),
      pageSize,
      filters,
    );
  }

  async updateManualTransactionInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord> {
    const currentTransaction = await this.getManualTransactionInSpace(
      spaceId,
      id,
    );
    const changes = normalizeUpdate(input);
    assertCurrentVersion(
      currentTransaction.updatedAt,
      changes.expectedUpdatedAt,
    );

    if (
      changes.categoryId !== undefined &&
      changes.categoryId !== null &&
      changes.categoryId !== currentTransaction.categoryId
    ) {
      await this.ensureActiveCategoryInSpace(spaceId, changes.categoryId);
    }

    if (isNoOp(currentTransaction, changes)) {
      return currentTransaction;
    }

    const updatedTransaction = await this.spaceTransactionStore.updateInSpace(
      spaceId,
      id,
      changes,
    );
    if (!updatedTransaction) {
      throw new TransactionNotFoundError();
    }

    return updatedTransaction;
  }

  async updateTransactionInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | ImportedTransactionRecord> {
    const manualTransaction = await this.spaceTransactionStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (manualTransaction) {
      return this.updateManualTransactionInSpace(spaceId, id, input);
    }

    const importedTransaction =
      await this.spaceImportedTransactionStore.findByIdInSpace(spaceId, id);
    if (!importedTransaction) {
      throw new TransactionNotFoundError();
    }

    if (
      input.categoryId === undefined ||
      Object.keys(input).some(
        (key) => key !== 'categoryId' && key !== 'expectedUpdatedAt',
      )
    ) {
      throw new ImportedTransactionImmutableError();
    }

    return this.updateImportedTransactionCategoryInSpace(
      spaceId,
      id,
      input.categoryId,
      input.expectedUpdatedAt,
    );
  }

  async deleteManualTransactionInSpace(
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const currentTransaction = await this.getManualTransactionInSpace(
      spaceId,
      id,
    );
    assertCurrentVersion(currentTransaction.updatedAt, expectedUpdatedAt);

    const deleted = await this.spaceTransactionStore.deleteInSpace(
      spaceId,
      id,
      expectedUpdatedAt,
    );
    if (!deleted) {
      throw new TransactionNotFoundError();
    }
  }

  async updateImportedTransactionCategoryInSpace(
    spaceId: string,
    id: string,
    categoryId: string | null,
    expectedUpdatedAt?: string,
  ): Promise<ImportedTransactionRecord> {
    const importedTransaction =
      await this.spaceImportedTransactionStore.findByIdInSpace(spaceId, id);
    if (!importedTransaction) {
      throw new TransactionNotFoundError();
    }
    assertCurrentVersion(importedTransaction.updatedAt, expectedUpdatedAt);

    if (categoryId !== null && categoryId !== importedTransaction.categoryId) {
      await this.ensureActiveCategoryInSpace(spaceId, categoryId);
    }

    if (categoryId === importedTransaction.categoryId) {
      return importedTransaction;
    }

    const updatedTransaction =
      await this.spaceImportedTransactionStore.updateCategoryInSpace(
        spaceId,
        id,
        {
          categoryId,
          ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }),
        },
      );
    if (!updatedTransaction) {
      throw new TransactionNotFoundError();
    }

    return updatedTransaction;
  }

  private async ensureActiveCategoryInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<void> {
    if (!this.categoryStore.findBySpaceId) {
      throw new Error('Space transaction persistence is not configured');
    }

    const category = await this.categoryStore.findBySpaceId(
      spaceId,
      categoryId,
    );
    if (!category) {
      throw new CategoryNotFoundError();
    }
    if (!category.isActive) {
      throw new CategoryInactiveError();
    }
  }
}

function normalizeUpdate(
  input: UpdateManualTransaction,
): UpdateManualTransaction {
  return {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.purchaseDate !== undefined
      ? { purchaseDate: input.purchaseDate }
      : {}),
    ...(input.description !== undefined
      ? { description: normalizeDescription(input.description) }
      : {}),
    ...(input.amount !== undefined
      ? { amount: normalizeAmount(input.amount) }
      : {}),
    ...(input.expectedUpdatedAt === undefined
      ? {}
      : { expectedUpdatedAt: input.expectedUpdatedAt }),
  };
}

function normalizeDescription(description: string): string {
  return description.trim();
}

function isNoOp(
  currentTransaction: ManualTransactionRecord,
  changes: UpdateManualTransaction,
): boolean {
  return (
    (changes.categoryId === undefined ||
      changes.categoryId === currentTransaction.categoryId) &&
    (changes.purchaseDate === undefined ||
      changes.purchaseDate === currentTransaction.purchaseDate) &&
    (changes.description === undefined ||
      changes.description === currentTransaction.description) &&
    (changes.amount === undefined ||
      changes.amount === currentTransaction.amount)
  );
}

function toTransactionPage(
  records: TransactionRecord[],
  pageSize: number,
  filters: TransactionFilters,
): TransactionPage {
  const items = records.slice(0, pageSize);
  const hasNextPage = records.length > pageSize;
  const lastItem = items.at(-1);

  return {
    items,
    nextCursor:
      hasNextPage && lastItem
        ? encodeTransactionCursor(
            {
              purchaseDate: lastItem.purchaseDate,
              transactionId: lastItem.id,
            },
            filters,
          )
        : null,
  };
}

function assertCurrentVersion(
  updatedAt: Date,
  expectedUpdatedAt: string | undefined,
): void {
  if (expectedUpdatedAt === undefined) return;

  const expectedTime = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedTime) || updatedAt.getTime() !== expectedTime) {
    throw new StaleEditError();
  }
}
