import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import type {
  TransactionCategoryRecord,
  TransactionCategoryStore,
} from './transaction-category-store';
import type {
  ImportedTransactionRecord,
  SpaceImportedTransactionStore,
  UpdateImportedTransactionCategory,
} from './imported-transaction-store';
import { ImportedTransactionImmutableError } from './transaction-errors';
import { TransactionsService } from './transactions.service';

describe('TransactionsService imported transactions', () => {
  it('reassigns an imported transaction within its Space and clears match confidence', async () => {
    const imported = new ImportedTransactionStoreFake(importedRecord());
    const service = createService(imported, [categoryRecord({ id: '43' })]);
    await expect(
      service.updateImportedTransactionCategoryInSpace(
        'member-2',
        'space-7',
        '1',
        '43',
      ),
    ).resolves.toMatchObject({
      categoryId: '43',
      categoryMatchConfidence: null,
    });
    expect(imported.updatedInput).toEqual({ categoryId: '43' });
  });

  it('rejects missing, cross-Space, and inactive category assignments', async () => {
    const imported = new ImportedTransactionStoreFake(importedRecord());
    const service = createService(imported, [
      categoryRecord({ id: '43', isActive: false }),
    ]);
    await expect(
      service.updateImportedTransactionCategoryInSpace(
        'member-2',
        'space-7',
        '1',
        '404',
      ),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.updateImportedTransactionCategoryInSpace(
        'member-2',
        'space-7',
        '1',
        '43',
      ),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    await expect(
      service.updateImportedTransactionCategoryInSpace(
        'member-2',
        'space-8',
        '1',
        null,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'TRANSACTION_NOT_FOUND' }),
    );
    expect(imported.updatedInput).toBeUndefined();
  });

  it('routes category-only patches and rejects imported statement fact changes', async () => {
    const imported = new ImportedTransactionStoreFake(importedRecord());
    const service = createService(imported, [categoryRecord({ id: '43' })]);
    await expect(
      service.updateTransactionInSpace('member-2', 'space-7', '1', {
        categoryId: '43',
      }),
    ).resolves.toMatchObject({
      categoryId: '43',
      categoryMatchConfidence: null,
    });
    await expect(
      service.updateTransactionInSpace('member-2', 'space-7', '1', {
        categoryId: '43',
        amount: '99.00',
      }),
    ).rejects.toBeInstanceOf(ImportedTransactionImmutableError);
  });
});

function createService(
  imported: SpaceImportedTransactionStore,
  categories: TransactionCategoryRecord[],
) {
  return new TransactionsService(
    new TransactionCategoryStoreFake(categories),
    { findByIdInSpace: jest.fn().mockResolvedValue(null) } as never,
    imported,
  );
}

class ImportedTransactionStoreFake implements SpaceImportedTransactionStore {
  updatedInput: UpdateImportedTransactionCategory | undefined;
  updatedActorUserId: string | undefined;
  constructor(private readonly transaction: ImportedTransactionRecord) {}
  create(): Promise<ImportedTransactionRecord> {
    return Promise.reject(new Error('not used'));
  }
  findByFingerprintInSpace(): Promise<ImportedTransactionRecord[]> {
    return Promise.resolve([]);
  }
  findByIdInSpace(spaceId: string, id: string) {
    return Promise.resolve(
      this.transaction.spaceId === spaceId && this.transaction.id === id
        ? this.transaction
        : null,
    );
  }
  updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedTransactionCategory,
    actorUserId: string,
  ) {
    this.updatedInput = input;
    this.updatedActorUserId = actorUserId;
    if (this.transaction.spaceId !== spaceId || this.transaction.id !== id)
      return Promise.resolve(null);
    return Promise.resolve({
      ...this.transaction,
      categoryId: input.categoryId,
      categoryMatchConfidence: null,
    });
  }
}

class TransactionCategoryStoreFake implements TransactionCategoryStore {
  constructor(private readonly categories: TransactionCategoryRecord[]) {}
  findBySpaceId(spaceId: string, id: string) {
    return Promise.resolve(
      this.categories.find(
        (category) => category.spaceId === spaceId && category.id === id,
      ) ?? null,
    );
  }
}

function categoryRecord(
  overrides: Partial<TransactionCategoryRecord> = {},
): TransactionCategoryRecord {
  return { id: '42', spaceId: 'space-7', isActive: true, ...overrides };
}

function importedRecord(): ImportedTransactionRecord {
  return {
    id: '1',
    spaceId: 'space-7',
    addedByUserId: '7',
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
  };
}
