import { CategoryNotFoundError } from '../../categories/application/category-errors';
import { StaleEditError } from '../../errors/application-error';
import type {
  TransactionCategoryRecord,
  TransactionCategoryStore,
} from './transaction-category-store';
import type {
  ManualTransactionRecord,
  NewManualTransaction,
  SpaceTransactionPageQuery,
  TransactionRecord,
  SpaceTransactionStore,
  UpdateManualTransaction,
} from './transaction-store';
import type {
  NewTransactionActivity,
  TransactionActivityRecord,
  TransactionActivityStore,
} from './transaction-activity-store';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  it('creates manual Transactions with immutable Space attribution and same-Space Categories', async () => {
    const transactionStore = new TransactionStoreFake();
    const categoryStore = new TransactionCategoryStoreFake([
      categoryRecord({ id: '42', spaceId: 'space-7' }),
      categoryRecord({ id: '43', spaceId: 'space-8' }),
    ]);
    const service = new TransactionsService(
      categoryStore,
      transactionStore,
      transactionStore,
    );

    const createdTransaction = await service.createManualTransactionInSpace(
      'member-2',
      'space-7',
      {
        categoryId: '42',
        purchaseDate: '2026-08-01',
        description: '  Shared dinner  ',
        amount: '12.99',
      },
    );

    expect(transactionStore.spaceCreatedInput).toEqual({
      spaceId: 'space-7',
      addedByUserId: 'member-2',
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: 'Shared dinner',
      amount: '12.99',
    });
    expect(createdTransaction).toMatchObject({
      spaceId: 'space-7',
      addedByUserId: 'member-2',
    });

    await expect(
      service.createManualTransactionInSpace('member-2', 'space-7', {
        categoryId: '43',
        purchaseDate: '2026-08-02',
        description: 'Wrong Space Category',
        amount: '1.00',
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('preserves creator attribution and rejects stale Space edits and deletes', async () => {
    const updatedAt = new Date('2026-08-29T00:00:00.000Z');
    const transactionStore = new TransactionStoreFake([
      transactionRecord({
        spaceId: 'space-7',
        addedByUserId: 'member-1',
        updatedAt,
      }),
    ]);
    const categoryStore = new TransactionCategoryStoreFake([
      categoryRecord({ id: '42', spaceId: 'space-7' }),
      categoryRecord({ id: '43', spaceId: 'space-7' }),
    ]);
    const service = new TransactionsService(
      categoryStore,
      transactionStore,
      transactionStore,
    );

    const updatedTransaction = await service.updateManualTransactionInSpace(
      'member-2',
      'space-7',
      '1',
      {
        categoryId: '43',
        description: ' Shared dinner ',
        expectedUpdatedAt: updatedAt.toISOString(),
      },
    );

    expect(transactionStore.spaceUpdatedInput).toEqual({
      categoryId: '43',
      description: 'Shared dinner',
      expectedUpdatedAt: updatedAt.toISOString(),
    });
    expect(transactionStore.spaceUpdatedActorUserId).toBe('member-2');
    expect(updatedTransaction.addedByUserId).toBe('member-1');

    await expect(
      service.updateManualTransactionInSpace('member-2', 'space-7', '1', {
        description: 'Conflicting edit',
        expectedUpdatedAt: '2026-08-30T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    await expect(
      service.deleteManualTransactionInSpace(
        'member-2',
        'space-7',
        '1',
        '2026-08-30T00:00:00.000Z',
      ),
    ).rejects.toBeInstanceOf(StaleEditError);
  });

  it('passes the deleting actor through the central mutation boundary', async () => {
    const transactionStore = new TransactionStoreFake([
      transactionRecord({ spaceId: 'space-7' }),
    ]);
    const service = new TransactionsService(
      new TransactionCategoryStoreFake(),
      transactionStore,
      transactionStore,
    );

    await service.deleteManualTransactionInSpace(
      'member-2',
      'space-7',
      '1',
      transactionStore.transactions[0].updatedAt.toISOString(),
    );

    expect(transactionStore.spaceDeletedActorUserId).toBe('member-2');
  });

  it('lists a selected Space without rebinding the query to the current member', async () => {
    const transactionStore = new TransactionStoreFake(
      [],
      [transactionPageRecord({ spaceId: 'space-7' })],
    );
    const service = new TransactionsService(
      new TransactionCategoryStoreFake(),
      transactionStore,
      transactionStore,
    );

    await expect(
      service.listTransactionsInSpace('space-7', { pageSize: 20 }),
    ).resolves.toEqual({
      items: transactionStore.pageResults,
      nextCursor: null,
    });
    expect(transactionStore.spacePageQuery).toEqual({
      spaceId: 'space-7',
      filters: {},
      after: null,
      pageSize: 20,
    });
  });

  it('returns only recorded activity for an existing Transaction', async () => {
    const transaction = transactionRecord({ id: '1', spaceId: 'space-7' });
    const transactionStore = new TransactionStoreFake([transaction]);
    const activityStore = new TransactionActivityStoreFake([
      {
        id: '200',
        transactionId: '1',
        spaceId: 'space-7',
        actorUserId: 'member-2',
        type: 'created',
        occurredAt: transaction.createdAt,
      },
    ]);
    const service = new TransactionsService(
      new TransactionCategoryStoreFake(),
      transactionStore,
      transactionStore as never,
      activityStore,
    );

    await expect(
      service.listTransactionActivityInSpace('space-7', '1'),
    ).resolves.toEqual(activityStore.activities);
    await expect(
      service.listTransactionActivityInSpace('space-8', '1'),
    ).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
  });

  it('lists retained deleted Transactions separately from active pages', async () => {
    const transactionStore = new TransactionStoreFake([
      transactionRecord({ id: '1', spaceId: 'space-7' }),
      transactionRecord({
        id: '2',
        spaceId: 'space-7',
        deletedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ]);
    const service = new TransactionsService(
      new TransactionCategoryStoreFake(),
      transactionStore,
      transactionStore,
    );

    await expect(
      service.listDeletedTransactionsInSpace('space-7', { pageSize: 20 }),
    ).resolves.toEqual({
      items: [toPageRecord(transactionStore.transactions[1])],
      nextCursor: null,
    });
    expect(transactionStore.spacePageQuery).toMatchObject({
      spaceId: 'space-7',
      deletedOnly: true,
    });
  });
});

class TransactionStoreFake implements SpaceTransactionStore {
  spaceCreatedInput: NewManualTransaction | undefined;
  updatedTransaction: ManualTransactionRecord | undefined;
  spaceUpdatedInput: UpdateManualTransaction | undefined;
  spaceUpdatedActorUserId: string | undefined;
  spaceDeletedActorUserId: string | undefined;
  spacePageQuery: SpaceTransactionPageQuery | undefined;
  pageResults: TransactionRecord[];

  constructor(
    public readonly transactions: ManualTransactionRecord[] = [],
    pageResults: TransactionRecord[] = [],
  ) {
    this.pageResults =
      pageResults.length > 0 ? pageResults : transactions.map(toPageRecord);
  }

  createInSpace(input: NewManualTransaction): Promise<ManualTransactionRecord> {
    this.spaceCreatedInput = input;
    const createdTransaction = transactionRecord({
      ...input,
      id: '2',
      source: 'manual',
    });
    this.transactions.push(createdTransaction);
    return Promise.resolve(createdTransaction);
  }

  findPageInSpace(
    query: SpaceTransactionPageQuery,
  ): Promise<TransactionRecord[]> {
    this.spacePageQuery = query;
    return Promise.resolve(
      this.pageResults.filter(
        (transaction) =>
          transaction.spaceId === query.spaceId &&
          (query.deletedOnly
            ? transaction.deletedAt !== null
            : transaction.deletedAt === null),
      ),
    );
  }

  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualTransactionRecord | null> {
    return Promise.resolve(
      this.transactions.find(
        (transaction) =>
          transaction.spaceId === spaceId &&
          transaction.id === id &&
          transaction.deletedAt === null,
      ) ?? null,
    );
  }

  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
    actorUserId: string,
  ): Promise<ManualTransactionRecord | null> {
    this.spaceUpdatedInput = input;
    this.spaceUpdatedActorUserId = actorUserId;
    const transaction = this.transactions.find(
      (candidate) => candidate.spaceId === spaceId && candidate.id === id,
    );
    if (!transaction) {
      return Promise.resolve(null);
    }

    const changes = { ...input };
    delete changes.expectedUpdatedAt;
    Object.assign(transaction, changes);
    this.updatedTransaction = transaction;
    return Promise.resolve(transaction);
  }

  deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
  ): Promise<boolean> {
    this.spaceDeletedActorUserId = actorUserId;
    const transaction = this.transactions.find(
      (candidate) =>
        candidate.spaceId === spaceId &&
        candidate.id === id &&
        candidate.deletedAt === null,
    );
    if (!transaction) {
      return Promise.resolve(false);
    }

    transaction.deletedAt = new Date('2026-09-01T00:00:00.000Z');
    return Promise.resolve(true);
  }

  findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualTransactionRecord | null> {
    return Promise.resolve(
      this.transactions.find(
        (transaction) =>
          transaction.spaceId === spaceId && transaction.id === id,
      ) ?? null,
    );
  }
}

class TransactionCategoryStoreFake implements TransactionCategoryStore {
  readonly spaceLookups: string[] = [];

  constructor(private readonly categories: TransactionCategoryRecord[] = []) {}

  findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<TransactionCategoryRecord | null> {
    this.spaceLookups.push(id);
    return Promise.resolve(
      this.categories.find(
        (category) => category.spaceId === spaceId && category.id === id,
      ) ?? null,
    );
  }
}

class TransactionActivityStoreFake implements TransactionActivityStore {
  constructor(public readonly activities: TransactionActivityRecord[] = []) {}

  create(input: NewTransactionActivity): Promise<TransactionActivityRecord> {
    const activity = { id: String(this.activities.length + 1), ...input };
    this.activities.push(activity);
    return Promise.resolve(activity);
  }

  findByTransactionInSpace(
    spaceId: string,
    transactionId: string,
  ): Promise<TransactionActivityRecord[]> {
    return Promise.resolve(
      this.activities.filter(
        (activity) =>
          activity.spaceId === spaceId &&
          activity.transactionId === transactionId,
      ),
    );
  }
}

function categoryRecord(
  overrides: Partial<TransactionCategoryRecord> = {},
): TransactionCategoryRecord {
  return {
    id: '42',
    spaceId: 'space-7',
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
    spaceId: 'space-7',
    addedByUserId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function transactionPageRecord(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    spaceId: 'space-7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: null,
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function toPageRecord(transaction: ManualTransactionRecord): TransactionRecord {
  return {
    ...transaction,
    statementImportId: null,
  };
}
