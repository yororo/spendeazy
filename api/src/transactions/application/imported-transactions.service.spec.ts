import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import type {
  TransactionCategoryRecord,
  TransactionCategoryStore,
} from './transaction-category-store';
import {
  type ImportedTransactionRecord,
  type ImportedTransactionStore,
} from './imported-transaction-store';
import { ImportedTransactionImmutableError } from './transaction-errors';
import { TransactionsService } from './transactions.service';

describe('TransactionsService imported transactions', () => {
  it('reassigns an imported transaction and clears category-match confidence', async () => {
    const importedTransactions = new ImportedTransactionStoreFake(
      importedTransactionRecord(),
    );
    const service = new TransactionsService(
      {} as never,
      new TransactionCategoryStoreFake([categoryRecord({ id: '43' })]),
      importedTransactions,
    );

    await expect(
      service.updateImportedTransactionCategory('7', '1', '43'),
    ).resolves.toEqual({
      ...importedTransactionRecord(),
      categoryId: '43',
      categoryMatchConfidence: null,
    });

    expect(importedTransactions.updatedInput).toEqual({ categoryId: '43' });
  });

  it('can move an imported transaction to Uncategorized', async () => {
    const importedTransactions = new ImportedTransactionStoreFake(
      importedTransactionRecord(),
    );
    const service = new TransactionsService(
      {} as never,
      new TransactionCategoryStoreFake(),
      importedTransactions,
    );

    await expect(
      service.updateImportedTransactionCategory('7', '1', null),
    ).resolves.toMatchObject({
      categoryId: null,
      categoryMatchConfidence: null,
    });
  });

  it('rejects absent, cross-user, and inactive category assignments without writing', async () => {
    const importedTransactions = new ImportedTransactionStoreFake(
      importedTransactionRecord(),
    );
    const service = new TransactionsService(
      {} as never,
      new TransactionCategoryStoreFake([
        categoryRecord({ id: '43', isActive: false }),
      ]),
      importedTransactions,
    );

    await expect(
      service.updateImportedTransactionCategory('7', '1', '404'),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.updateImportedTransactionCategory('7', '1', '43'),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    await expect(
      service.updateImportedTransactionCategory('8', '1', null),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'TRANSACTION_NOT_FOUND' }),
    );
    expect(importedTransactions.updatedInput).toBeUndefined();
  });

  it('does not expose imported statement facts as a patchable operation', async () => {
    const importedTransactions = new ImportedTransactionStoreFake(
      importedTransactionRecord(),
    );
    const service = new TransactionsService(
      { findById: jest.fn().mockResolvedValue(null) } as never,
      new TransactionCategoryStoreFake([categoryRecord({ id: '43' })]),
      importedTransactions,
    );

    await expect(
      service.updateTransaction('7', '1', {
        categoryId: '43',
        amount: '99.00',
      }),
    ).rejects.toBeInstanceOf(ImportedTransactionImmutableError);
    expect(importedTransactions.updatedInput).toBeUndefined();
  });

  it('routes the transaction patch seam to imported category reassignment', async () => {
    const importedTransactions = new ImportedTransactionStoreFake(
      importedTransactionRecord(),
    );
    const service = new TransactionsService(
      { findById: jest.fn().mockResolvedValue(null) } as never,
      new TransactionCategoryStoreFake([categoryRecord({ id: '43' })]),
      importedTransactions,
    );

    await expect(
      service.updateTransaction('7', '1', { categoryId: '43' }),
    ).resolves.toMatchObject({
      categoryId: '43',
      categoryMatchConfidence: null,
    });
  });

  it('rejects statement-fact patches through the imported transaction seam', async () => {
    const importedTransactions = new ImportedTransactionStoreFake(
      importedTransactionRecord(),
    );
    const service = new TransactionsService(
      {} as never,
      new TransactionCategoryStoreFake([categoryRecord({ id: '43' })]),
      importedTransactions,
    );

    await expect(
      service.updateImportedTransaction('7', '1', {
        categoryId: '43',
        amount: '99.00',
      }),
    ).rejects.toBeInstanceOf(ImportedTransactionImmutableError);
    expect(importedTransactions.updatedInput).toBeUndefined();
  });
});

class ImportedTransactionStoreFake implements ImportedTransactionStore {
  updatedInput: { categoryId: string | null } | undefined;

  constructor(private readonly transaction: ImportedTransactionRecord) {}

  findByFingerprint(): Promise<ImportedTransactionRecord[]> {
    return Promise.resolve([]);
  }

  create(): Promise<ImportedTransactionRecord> {
    return Promise.reject(new Error('not used'));
  }

  findById(
    userId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null> {
    return Promise.resolve(
      this.transaction.userId === userId && this.transaction.id === id
        ? this.transaction
        : null,
    );
  }

  updateCategory(
    userId: string,
    id: string,
    input: { categoryId: string | null },
  ): Promise<ImportedTransactionRecord | null> {
    this.updatedInput = input;
    if (this.transaction.userId !== userId || this.transaction.id !== id) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      ...this.transaction,
      categoryId: input.categoryId,
      categoryMatchConfidence: null,
    });
  }
}

class TransactionCategoryStoreFake implements TransactionCategoryStore {
  constructor(private readonly categories: TransactionCategoryRecord[] = []) {}

  findById(
    userId: string,
    id: string,
  ): Promise<TransactionCategoryRecord | null> {
    return Promise.resolve(
      this.categories.find(
        (category) => category.userId === userId && category.id === id,
      ) ?? null,
    );
  }
}

function categoryRecord(
  overrides: Partial<TransactionCategoryRecord> = {},
): TransactionCategoryRecord {
  return {
    id: '42',
    userId: '7',
    isActive: true,
    ...overrides,
  };
}

function importedTransactionRecord(
  overrides: Partial<ImportedTransactionRecord> = {},
): ImportedTransactionRecord {
  return {
    id: '1',
    userId: '7',
    categoryId: '42',
    statementImportId: '100',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    categoryMatchConfidence: '0.9000',
    importFingerprint: 'a'.repeat(64),
    source: 'imported',
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}
