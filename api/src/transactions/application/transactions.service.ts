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
  TRANSACTION_ACTIVITY_STORE,
  type TransactionActivityRecord,
  type TransactionActivityStore,
} from './transaction-activity-store';
import {
  SPACE_IMPORTED_TRANSACTION_STORE,
  type ImportedTransactionRecord,
  type SpaceImportedTransactionStore,
} from './imported-transaction-store';
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from './transaction-cursor';
import {
  SPACE_TRANSACTION_STORE,
  type ManualTransactionRecord,
  type NewManualTransaction,
  type SpaceTransactionStore,
  type SpaceTransactionPageQuery,
  type TransactionFilters,
  type TransactionRecord,
  type UpdateManualTransaction,
} from './transaction-store';

export const DEFAULT_TRANSACTION_PAGE_SIZE = 20;
export const MAX_TRANSACTION_PAGE_SIZE = 100;

const SPACE_STORE_NOT_CONFIGURED =
  'Space transaction persistence is not configured';

const EMPTY_SPACE_TRANSACTION_STORE: SpaceTransactionStore = {
  findByIdInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByIdInHistoryInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findPageInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  countInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  createInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  deleteInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

const EMPTY_SPACE_IMPORTED_TRANSACTION_STORE: SpaceImportedTransactionStore = {
  create: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByFingerprintInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByIdInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByIdInHistoryInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateCategoryInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  updateInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  deleteInSpace: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

const EMPTY_TRANSACTION_ACTIVITY_STORE: TransactionActivityStore = {
  create: () => Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
  findByTransactionInSpace: () =>
    Promise.reject(new Error(SPACE_STORE_NOT_CONFIGURED)),
};

export interface ListTransactionsInput extends TransactionFilters {
  cursor?: string;
  pageSize?: number;
}

export interface TransactionPage {
  items: TransactionRecord[];
  nextCursor: string | null;
  totalCount: string;
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
    @Inject(TRANSACTION_CATEGORY_STORE)
    private readonly categoryStore: TransactionCategoryStore,
    @Inject(SPACE_TRANSACTION_STORE)
    private readonly spaceTransactionStore: SpaceTransactionStore = EMPTY_SPACE_TRANSACTION_STORE,
    @Inject(SPACE_IMPORTED_TRANSACTION_STORE)
    private readonly spaceImportedTransactionStore: SpaceImportedTransactionStore = EMPTY_SPACE_IMPORTED_TRANSACTION_STORE,
    @Inject(TRANSACTION_ACTIVITY_STORE)
    private readonly transactionActivityStore: TransactionActivityStore = EMPTY_TRANSACTION_ACTIVITY_STORE,
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

  async listTransactionActivityInSpace(
    spaceId: string,
    transactionId: string,
  ): Promise<TransactionActivityRecord[]> {
    const transaction = await this.findTransactionInHistoryInSpace(
      spaceId,
      transactionId,
    );
    if (!transaction) {
      throw new TransactionNotFoundError();
    }

    return this.transactionActivityStore.findByTransactionInSpace(
      spaceId,
      transactionId,
    );
  }

  async listTransactionsInSpace(
    spaceId: string,
    input: ListTransactionsInput,
  ): Promise<TransactionPage> {
    return this.listTransactionsPageInSpace(spaceId, input, false);
  }

  async listDeletedTransactionsInSpace(
    spaceId: string,
    input: ListTransactionsInput,
  ): Promise<TransactionPage> {
    return this.listTransactionsPageInSpace(spaceId, input, true);
  }

  async updateManualTransactionInSpace(
    actorUserId: string,
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
      actorUserId,
    );
    if (!updatedTransaction) {
      throw new TransactionNotFoundError();
    }

    return updatedTransaction;
  }

  async updateTransactionInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | ImportedTransactionRecord> {
    const manualTransaction = await this.spaceTransactionStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (manualTransaction) {
      return this.updateManualTransactionInSpace(
        actorUserId,
        spaceId,
        id,
        input,
      );
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
      actorUserId,
      spaceId,
      id,
      input.categoryId,
      input.expectedUpdatedAt,
    );
  }

  async updateSharedTransactionInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | ImportedTransactionRecord> {
    const manualTransaction = await this.spaceTransactionStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (manualTransaction) {
      return this.updateManualTransactionInSpace(
        actorUserId,
        spaceId,
        id,
        input,
      );
    }

    return this.updateImportedTransactionInSpace(
      actorUserId,
      spaceId,
      id,
      input,
    );
  }

  async updateImportedTransactionInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ImportedTransactionRecord> {
    const importedTransaction =
      await this.spaceImportedTransactionStore.findByIdInSpace(spaceId, id);
    if (!importedTransaction) {
      throw new TransactionNotFoundError();
    }

    const changes = normalizeUpdate(input);
    assertCurrentVersion(
      importedTransaction.updatedAt,
      changes.expectedUpdatedAt,
    );

    if (
      changes.categoryId !== undefined &&
      changes.categoryId !== null &&
      changes.categoryId !== importedTransaction.categoryId
    ) {
      await this.ensureActiveCategoryInSpace(spaceId, changes.categoryId);
    }

    if (isNoOp(importedTransaction, changes)) {
      return importedTransaction;
    }

    const updatedTransaction =
      await this.spaceImportedTransactionStore.updateInSpace(
        spaceId,
        id,
        changes,
        actorUserId,
      );
    if (!updatedTransaction) {
      throw new TransactionNotFoundError();
    }

    return updatedTransaction;
  }

  async deleteManualTransactionInSpace(
    actorUserId: string,
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
      actorUserId,
      expectedUpdatedAt,
    );
    if (!deleted) {
      throw new TransactionNotFoundError();
    }
  }

  async deleteTransactionInSpace(
    actorUserId: string,
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const manualTransaction = await this.spaceTransactionStore.findByIdInSpace(
      spaceId,
      id,
    );
    if (manualTransaction) {
      return this.deleteManualTransactionInSpace(
        actorUserId,
        spaceId,
        id,
        expectedUpdatedAt,
      );
    }

    const importedTransaction =
      await this.spaceImportedTransactionStore.findByIdInSpace(spaceId, id);
    if (!importedTransaction) {
      throw new TransactionNotFoundError();
    }
    assertCurrentVersion(importedTransaction.updatedAt, expectedUpdatedAt);

    const deleted = await this.spaceImportedTransactionStore.deleteInSpace(
      spaceId,
      id,
      actorUserId,
      expectedUpdatedAt,
    );
    if (!deleted) {
      throw new TransactionNotFoundError();
    }
  }

  async updateImportedTransactionCategoryInSpace(
    actorUserId: string,
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
        actorUserId,
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

  private async listTransactionsPageInSpace(
    spaceId: string,
    input: ListTransactionsInput,
    deletedOnly: boolean,
  ): Promise<TransactionPage> {
    const cursor = input.cursor;
    const pageSize = input.pageSize ?? DEFAULT_TRANSACTION_PAGE_SIZE;
    const filters = { ...input };
    delete filters.cursor;
    delete filters.pageSize;
    const after =
      cursor !== undefined
        ? decodeTransactionCursor(cursor, filters).position
        : null;
    const query: SpaceTransactionPageQuery = {
      spaceId,
      filters,
      after,
      pageSize,
      ...(deletedOnly ? { deletedOnly: true } : {}),
    };
    const [records, totalCount] = await Promise.all([
      this.spaceTransactionStore.findPageInSpace(query),
      this.spaceTransactionStore.countInSpace({ ...query, after: null }),
    ]);
    return {
      ...toTransactionPage(records, pageSize, filters),
      totalCount: String(totalCount),
    };
  }

  private async findTransactionInHistoryInSpace(
    spaceId: string,
    transactionId: string,
  ): Promise<ManualTransactionRecord | ImportedTransactionRecord | null> {
    const manualTransaction =
      await this.spaceTransactionStore.findByIdInHistoryInSpace(
        spaceId,
        transactionId,
      );
    if (manualTransaction) {
      return manualTransaction;
    }

    return this.spaceImportedTransactionStore.findByIdInHistoryInSpace(
      spaceId,
      transactionId,
    );
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
  currentTransaction: Pick<
    TransactionRecord,
    'categoryId' | 'purchaseDate' | 'description' | 'amount'
  >,
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
): Omit<TransactionPage, 'totalCount'> {
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
