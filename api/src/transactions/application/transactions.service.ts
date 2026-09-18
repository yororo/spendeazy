import { Inject, Injectable } from '@nestjs/common';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { normalizeAmount } from '../../normalization/amount';
import {
  TRANSACTION_CATEGORY_STORE,
  type TransactionCategoryStore,
} from './transaction-category-store';
import { TransactionNotFoundError } from './transaction-errors';
import { ImportedTransactionImmutableError } from './transaction-errors';
import {
  IMPORTED_TRANSACTION_STORE,
  type ImportedTransactionRecord,
  type ImportedTransactionStore,
  type UpdateImportedTransactionInput,
} from './imported-transaction-store';
import {
  decodeTransactionCursor,
  encodeTransactionCursor,
} from './transaction-cursor';
import {
  TRANSACTION_STORE,
  type ManualTransactionRecord,
  type NewManualTransaction,
  type TransactionFilters,
  type TransactionPageQuery,
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
  'userId' | 'categoryId'
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
  ) {}

  async createManualTransaction(
    userId: string,
    input: CreateManualTransactionInput,
  ): Promise<ManualTransactionRecord> {
    const categoryId = input.categoryId ?? null;
    if (categoryId !== null) {
      await this.ensureActiveCategory(userId, categoryId);
    }

    return this.transactionStore.create({
      userId,
      categoryId,
      purchaseDate: input.purchaseDate,
      description: normalizeDescription(input.description),
      amount: normalizeAmount(input.amount),
    });
  }

  async getManualTransaction(
    userId: string,
    id: string,
  ): Promise<ManualTransactionRecord> {
    const transaction = await this.transactionStore.findById(userId, id);
    if (!transaction) {
      throw new TransactionNotFoundError();
    }

    return transaction;
  }

  async listTransactions(
    userId: string,
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
    const query: TransactionPageQuery = {
      userId,
      filters,
      after,
      pageSize,
    };
    const records = await this.transactionStore.findPage(query);
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

  async updateManualTransaction(
    userId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord> {
    const currentTransaction = await this.getManualTransaction(userId, id);
    const changes = normalizeUpdate(input);

    if (
      changes.categoryId !== undefined &&
      changes.categoryId !== null &&
      changes.categoryId !== currentTransaction.categoryId
    ) {
      await this.ensureActiveCategory(userId, changes.categoryId);
    }

    if (isNoOp(currentTransaction, changes)) {
      return currentTransaction;
    }

    const updatedTransaction = await this.transactionStore.update(
      userId,
      id,
      changes,
    );
    if (!updatedTransaction) {
      throw new TransactionNotFoundError();
    }

    return updatedTransaction;
  }

  async updateTransaction(
    userId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | ImportedTransactionRecord> {
    const manualTransaction = await this.transactionStore.findById(userId, id);
    if (manualTransaction) {
      return this.updateManualTransaction(userId, id, input);
    }

    const importedTransaction = await this.importedTransactionStore.findById(
      userId,
      id,
    );
    if (!importedTransaction) {
      throw new TransactionNotFoundError();
    }

    if (
      input.categoryId === undefined ||
      Object.keys(input).some((key) => key !== 'categoryId')
    ) {
      throw new ImportedTransactionImmutableError();
    }

    return this.updateImportedTransactionCategory(userId, id, input.categoryId);
  }

  async deleteManualTransaction(userId: string, id: string): Promise<void> {
    const deleted = await this.transactionStore.delete(userId, id);
    if (!deleted) {
      throw new TransactionNotFoundError();
    }
  }

  async updateImportedTransactionCategory(
    userId: string,
    id: string,
    categoryId: string | null,
  ): Promise<ImportedTransactionRecord> {
    const importedTransaction = await this.importedTransactionStore.findById(
      userId,
      id,
    );
    if (!importedTransaction) {
      throw new TransactionNotFoundError();
    }

    if (categoryId !== null && categoryId !== importedTransaction.categoryId) {
      await this.ensureActiveCategory(userId, categoryId);
    }

    if (categoryId === importedTransaction.categoryId) {
      return importedTransaction;
    }

    const updatedTransaction =
      await this.importedTransactionStore.updateCategory(userId, id, {
        categoryId,
      });
    if (!updatedTransaction) {
      throw new TransactionNotFoundError();
    }

    return updatedTransaction;
  }

  async updateImportedTransaction(
    userId: string,
    id: string,
    input: UpdateImportedTransactionInput,
  ): Promise<ImportedTransactionRecord> {
    if (Object.keys(input).some((key) => key !== 'categoryId')) {
      throw new ImportedTransactionImmutableError();
    }

    return this.updateImportedTransactionCategory(userId, id, input.categoryId);
  }

  private async ensureActiveCategory(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categoryStore.findById(userId, categoryId);
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
