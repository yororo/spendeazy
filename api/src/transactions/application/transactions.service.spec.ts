import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { ApplicationError } from '../../errors/application-error';
import type {
  TransactionCategoryRecord,
  TransactionCategoryStore,
} from './transaction-category-store';
import { TransactionNotFoundError } from './transaction-errors';
import { decodeTransactionCursor } from './transaction-cursor';
import type {
  ManualTransactionRecord,
  NewManualTransaction,
  TransactionPageQuery,
  TransactionRecord,
  TransactionFilters,
  TransactionStore,
  UpdateManualTransaction,
} from './transaction-store';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  it('creates a categorized manual transaction with a normalized description', async () => {
    const transactionStore = new TransactionStoreFake();
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake([categoryRecord()]),
    );

    const createdTransaction = await service.createManualTransaction('7', {
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: '  Monthly rent  ',
      amount: '250.00',
    });

    expect(createdTransaction).toEqual(transactionStore.createdTransaction);

    expect(transactionStore.createdInput).toEqual({
      userId: '7',
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: 'Monthly rent',
      amount: '250.00',
    });
  });

  it('creates an Uncategorized manual transaction without resolving a category', async () => {
    const categoryStore = new TransactionCategoryStoreFake();
    const transactionStore = new TransactionStoreFake();
    const service = new TransactionsService(transactionStore, categoryStore);

    await service.createManualTransaction('7', {
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
    });

    expect(transactionStore.createdInput).toMatchObject({ categoryId: null });
    expect(categoryStore.lookups).toEqual([]);
  });

  it('rejects absent, cross-user, and inactive category assignments', async () => {
    const categoryStore = new TransactionCategoryStoreFake([
      categoryRecord({ id: '43', userId: '7', isActive: false }),
      categoryRecord({ id: '44', userId: '8', isActive: true }),
    ]);
    const transactionStore = new TransactionStoreFake();
    const service = new TransactionsService(transactionStore, categoryStore);
    const input = {
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
    };

    await expect(
      service.createManualTransaction('7', { ...input, categoryId: '404' }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.createManualTransaction('7', { ...input, categoryId: '44' }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.createManualTransaction('7', { ...input, categoryId: '43' }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    expect(transactionStore.createdInput).toBeUndefined();
  });

  it('retrieves an owned manual transaction and hides absent or cross-user identifiers', async () => {
    const ownedTransaction = transactionRecord({ id: '1', userId: '7' });
    const transactionStore = new TransactionStoreFake([
      ownedTransaction,
      transactionRecord({ id: '42', userId: '8' }),
    ]);
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake(),
    );

    await expect(service.getManualTransaction('7', '1')).resolves.toEqual(
      ownedTransaction,
    );
    await expect(service.getManualTransaction('7', '42')).rejects.toEqual(
      expect.any(TransactionNotFoundError),
    );
    await expect(service.getManualTransaction('7', '404')).rejects.toEqual(
      expect.any(TransactionNotFoundError),
    );
  });

  it('fully patches a manual transaction and can move it between categories', async () => {
    const original = transactionRecord({ categoryId: '42' });
    const transactionStore = new TransactionStoreFake([original]);
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake([categoryRecord({ id: '43' })]),
    );

    const updatedTransaction = await service.updateManualTransaction('7', '1', {
      categoryId: '43',
      purchaseDate: '2026-08-02',
      description: '  Dinner  ',
      amount: '12.99',
    });

    expect(updatedTransaction).toEqual(transactionStore.updatedTransaction);

    expect(transactionStore.updatedInput).toEqual({
      categoryId: '43',
      purchaseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
    });
  });

  it('can clear a category and does not write a no-op patch', async () => {
    const original = transactionRecord({ categoryId: '42' });
    const transactionStore = new TransactionStoreFake([original]);
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake([categoryRecord()]),
    );

    await expect(
      service.updateManualTransaction('7', '1', { categoryId: null }),
    ).resolves.toMatchObject({ categoryId: null });
    expect(transactionStore.updatedInput).toEqual({ categoryId: null });

    transactionStore.updatedInput = undefined;
    transactionStore.transactions[0] = transactionRecord();
    await expect(
      service.updateManualTransaction('7', '1', {
        categoryId: '42',
        description: ' Coffee ',
        amount: '04.50',
      }),
    ).resolves.toEqual(transactionStore.transactions[0]);
    expect(transactionStore.updatedInput).toBeUndefined();
  });

  it('rejects moving a manual transaction to an absent or inactive category', async () => {
    const transactionStore = new TransactionStoreFake([transactionRecord()]);
    const categoryStore = new TransactionCategoryStoreFake([
      categoryRecord({ id: '43', isActive: false }),
    ]);
    const service = new TransactionsService(transactionStore, categoryStore);

    await expect(
      service.updateManualTransaction('7', '1', { categoryId: '404' }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.updateManualTransaction('7', '1', { categoryId: '43' }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    expect(transactionStore.updatedInput).toBeUndefined();
  });

  it('deletes an owned manual transaction and treats absent or cross-user identifiers as not found', async () => {
    const transactionStore = new TransactionStoreFake([
      transactionRecord({ id: '1', userId: '7' }),
      transactionRecord({ id: '2', userId: '8' }),
    ]);
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake(),
    );

    await expect(
      service.deleteManualTransaction('7', '1'),
    ).resolves.toBeUndefined();
    await expect(service.deleteManualTransaction('7', '1')).rejects.toEqual(
      expect.any(TransactionNotFoundError),
    );
    await expect(service.deleteManualTransaction('7', '2')).rejects.toEqual(
      expect.any(TransactionNotFoundError),
    );
  });

  it('lists a filtered owned page and creates a cursor from the last returned transaction', async () => {
    const transactions = [
      transactionPageRecord({ id: '3', purchaseDate: '2026-08-03' }),
      transactionPageRecord({ id: '2', purchaseDate: '2026-08-03' }),
      transactionPageRecord({ id: '1', purchaseDate: '2026-08-02' }),
    ];
    const transactionStore = new TransactionStoreFake([], transactions);
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake(),
    );
    const filters: TransactionFilters = {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      categoryId: '42',
      categoryState: 'categorized',
      statementImportId: '9',
      source: 'imported',
    };

    const page = await service.listTransactions('7', {
      ...filters,
      pageSize: 2,
    });
    expect(page.items).toEqual(transactions.slice(0, 2));
    expect(typeof page.nextCursor).toBe('string');
    if (typeof page.nextCursor !== 'string') {
      throw new Error('Expected a next cursor');
    }
    expect(decodeTransactionCursor(page.nextCursor, filters).position).toEqual({
      purchaseDate: '2026-08-03',
      transactionId: '2',
    });

    expect(transactionStore.pageQuery).toEqual({
      userId: '7',
      filters: {
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        categoryId: '42',
        categoryState: 'categorized',
        statementImportId: '9',
        source: 'imported',
      },
      after: null,
      pageSize: 2,
    });
  });

  it('binds the next request to the cursor filters and forwards the caller page size', async () => {
    const transactionStore = new TransactionStoreFake(
      [],
      [
        transactionPageRecord({ id: '2', purchaseDate: '2026-08-02' }),
        transactionPageRecord({ id: '1', purchaseDate: '2026-08-01' }),
      ],
    );
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake(),
    );
    const firstPage = await service.listTransactions('7', {
      fromDate: '2026-08-01',
      pageSize: 1,
    });

    transactionStore.pageResults = [
      transactionPageRecord({ id: '1', purchaseDate: '2026-08-01' }),
    ];
    await expect(
      service.listTransactions('7', {
        fromDate: '2026-08-01',
        pageSize: 1,
        cursor: firstPage.nextCursor ?? undefined,
      }),
    ).resolves.toEqual({
      items: transactionStore.pageResults,
      nextCursor: null,
    });

    expect(transactionStore.pageQuery).toEqual({
      userId: '7',
      filters: { fromDate: '2026-08-01' },
      after: { purchaseDate: '2026-08-02', transactionId: '2' },
      pageSize: 1,
    });
  });

  it('uses a default page size and returns no cursor at the final boundary', async () => {
    const transactionStore = new TransactionStoreFake(
      [],
      [transactionPageRecord({ id: '1' })],
    );
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake(),
    );

    await expect(service.listTransactions('7', {})).resolves.toEqual({
      items: transactionStore.pageResults,
      nextCursor: null,
    });
    expect(transactionStore.pageQuery?.pageSize).toBe(20);
  });

  it('does not return records owned by another user', async () => {
    const owned = transactionPageRecord({ id: '1', userId: '7' });
    const otherUser = transactionPageRecord({ id: '2', userId: '8' });
    const transactionStore = new TransactionStoreFake([], [owned, otherUser]);
    const service = new TransactionsService(
      transactionStore,
      new TransactionCategoryStoreFake(),
    );

    await expect(service.listTransactions('7', {})).resolves.toEqual({
      items: [owned],
      nextCursor: null,
    });
    expect(transactionStore.pageQuery?.userId).toBe('7');
  });

  it('rejects an empty cursor instead of treating it as the first page', async () => {
    const service = new TransactionsService(
      new TransactionStoreFake(),
      new TransactionCategoryStoreFake(),
    );

    await expect(
      service.listTransactions('7', { cursor: '' }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
});

class TransactionStoreFake implements TransactionStore {
  createdInput: NewManualTransaction | undefined;
  createdTransaction: ManualTransactionRecord | undefined;
  updatedInput: UpdateManualTransaction | undefined;
  updatedTransaction: ManualTransactionRecord | undefined;
  pageQuery: TransactionPageQuery | undefined;
  pageResults: TransactionRecord[];

  constructor(
    public readonly transactions: ManualTransactionRecord[] = [],
    pageResults: TransactionRecord[] = [],
  ) {
    this.pageResults =
      pageResults.length > 0 ? pageResults : transactions.map(toPageRecord);
  }

  findById(
    userId: string,
    id: string,
  ): Promise<ManualTransactionRecord | null> {
    return Promise.resolve(
      this.transactions.find(
        (transaction) => transaction.userId === userId && transaction.id === id,
      ) ?? null,
    );
  }

  create(input: NewManualTransaction): Promise<ManualTransactionRecord> {
    this.createdInput = input;
    this.createdTransaction = transactionRecord({ ...input, id: '2' });
    this.transactions.push(this.createdTransaction);
    return Promise.resolve(this.createdTransaction);
  }

  findPage(query: TransactionPageQuery): Promise<TransactionRecord[]> {
    this.pageQuery = query;
    return Promise.resolve(
      this.pageResults.filter(
        (transaction) => transaction.userId === query.userId,
      ),
    );
  }

  update(
    userId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | null> {
    this.updatedInput = input;
    const transaction = this.transactions.find(
      (candidate) => candidate.userId === userId && candidate.id === id,
    );
    if (!transaction) {
      return Promise.resolve(null);
    }

    Object.assign(transaction, input);
    this.updatedTransaction = transaction;
    return Promise.resolve(transaction);
  }

  delete(userId: string, id: string): Promise<boolean> {
    const index = this.transactions.findIndex(
      (transaction) => transaction.userId === userId && transaction.id === id,
    );
    if (index === -1) {
      return Promise.resolve(false);
    }

    this.transactions.splice(index, 1);
    return Promise.resolve(true);
  }
}

class TransactionCategoryStoreFake implements TransactionCategoryStore {
  readonly lookups: string[] = [];

  constructor(private readonly categories: TransactionCategoryRecord[] = []) {}

  findById(
    userId: string,
    id: string,
  ): Promise<TransactionCategoryRecord | null> {
    this.lookups.push(id);
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

function transactionRecord(
  overrides: Partial<ManualTransactionRecord> = {},
): ManualTransactionRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    userId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function transactionPageRecord(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    userId: '7',
    categoryId: '42',
    statementImportId: null,
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function toPageRecord(transaction: ManualTransactionRecord): TransactionRecord {
  return {
    ...transaction,
    statementImportId: null,
  };
}
