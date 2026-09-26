import type { EntityManager } from 'typeorm';
import { CategoryInactiveError } from '../../categories/application/category-errors';
import { TransactionActivityEntity } from '../../database/entities/transaction-activity.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import type {
  ManualTransactionRecord,
  TransactionRecord,
} from '../application/transaction-store';
import { TypeOrmTransactionStore } from './typeorm-transaction-store';

describe('TypeOrmTransactionStore', () => {
  it('creates and maps a manual transaction after locking its active category', async () => {
    const entity = transactionEntity();
    const transactionRepository = {
      create: jest.fn().mockReturnValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({
        id: '200',
        transactionId: '1',
        spaceId: '7',
        actorUserId: '7',
        type: 'created' as const,
        occurredAt: entity.createdAt,
      }),
      save: jest.fn().mockResolvedValue({
        id: '200',
        transactionId: '1',
        spaceId: '7',
        actorUserId: '7',
        type: 'created' as const,
        occurredAt: entity.createdAt,
      }),
    };
    const categoryQuery = categoryQueryBuilder({ isActive: true });
    const entityManager = transactionalEntityManager(
      transactionRepository,
      categoryQuery,
      activityRepository,
    );
    const store = new TypeOrmTransactionStore(entityManager);

    await expect(
      store.createInSpace({
        spaceId: '7',
        addedByUserId: '7',
        categoryId: '42',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      }),
    ).resolves.toEqual(transactionRecord());

    expect(transactionRepository.create).toHaveBeenCalledWith({
      spaceId: '7',
      addedByUserId: '7',
      categoryId: '42',
      statementImportId: null,
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      categoryMatchConfidence: null,
      importFingerprint: null,
      deletedAt: null,
    });
    expect(categoryQuery.setLock).toHaveBeenCalledWith('pessimistic_read');
    expect(activityRepository.create).toHaveBeenCalledWith({
      transactionId: '1',
      spaceId: '7',
      actorUserId: '7',
      type: 'created',
      occurredAt: entity.createdAt,
      beforeState: null,
      afterState: null,
    });
  });

  it('rejects creation when the locked category is inactive', async () => {
    const transactionRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const categoryQuery = categoryQueryBuilder({ isActive: false });
    const store = new TypeOrmTransactionStore(
      transactionalEntityManager(transactionRepository, categoryQuery),
    );

    await expect(
      store.createInSpace({
        spaceId: '7',
        categoryId: '42',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    expect(transactionRepository.create).not.toHaveBeenCalled();
  });

  it('updates a manual entity in place and keeps its manual-only identity', async () => {
    const entity = transactionEntity();
    const transactionRepository = {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };
    const categoryQuery = categoryQueryBuilder({ isActive: true });
    const store = new TypeOrmTransactionStore(
      transactionalEntityManager(
        transactionRepository,
        categoryQuery,
        activityRepository,
      ),
    );

    await expect(
      store.updateInSpace(
        '7',
        '1',
        {
          categoryId: '43',
          purchaseDate: '2026-08-02',
          description: 'Dinner',
          amount: '12.99',
        },
        '8',
      ),
    ).resolves.toEqual({
      ...transactionRecord(),
      categoryId: '43',
      purchaseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
    });

    expect(transactionRepository.save).toHaveBeenCalledWith(entity);
    expect(categoryQuery.setLock).toHaveBeenCalledWith('pessimistic_read');
    expect(activityRepository.create).toHaveBeenCalledWith({
      transactionId: '1',
      spaceId: '7',
      actorUserId: '8',
      type: 'edited',
      occurredAt: entity.updatedAt,
      beforeState: {
        categoryId: '42',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
      afterState: {
        categoryId: '43',
        purchaseDate: '2026-08-02',
        description: 'Dinner',
        amount: '12.99',
      },
    });
  });

  it('soft-deletes a manual Transaction and records the deleting actor atomically', async () => {
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const transactionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };
    const store = new TypeOrmTransactionStore(
      transactionalEntityManager(
        transactionRepository,
        categoryQueryBuilder({ isActive: true }),
        activityRepository,
      ),
    );

    await expect(store.deleteInSpace('7', '1', '8')).resolves.toBe(true);
    const setChanges = (
      updateQuery.set.mock.calls[0] as unknown as [{ deletedAt: unknown }]
    )[0];
    expect(setChanges.deletedAt).toBeInstanceOf(Date);
    expect(updateQuery.andWhere).toHaveBeenCalledWith('deleted_at IS NULL');
    const activityInput = (
      activityRepository.create.mock.calls[0] as unknown as [
        {
          transactionId: string;
          spaceId: string;
          actorUserId: string;
          type: string;
          occurredAt: unknown;
          beforeState: null;
          afterState: null;
        },
      ]
    )[0];
    expect(activityInput).toMatchObject({
      transactionId: '1',
      spaceId: '7',
      actorUserId: '8',
      type: 'deleted',
      beforeState: null,
      afterState: null,
    });
    expect(activityInput.occurredAt).toBeInstanceOf(Date);
  });

  it('does not create an edit activity when the optimistic version is stale', async () => {
    const entity = transactionEntity();
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const transactionRepository = {
      findOne: jest.fn().mockResolvedValue(entity),
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
      save: jest.fn(),
    };
    const activityRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const store = new TypeOrmTransactionStore(
      transactionalEntityManager(
        transactionRepository,
        categoryQueryBuilder({ isActive: true }),
        activityRepository,
      ),
    );

    await expect(
      store.updateInSpace(
        '7',
        '1',
        {
          description: 'Stale edit',
          expectedUpdatedAt: '2026-08-30T00:00:00.000Z',
        },
        '8',
      ),
    ).rejects.toMatchObject({ code: 'STALE_EDIT' });

    expect(activityRepository.create).not.toHaveBeenCalled();
    expect(transactionRepository.save).not.toHaveBeenCalled();
  });

  it('queries a stable filtered transaction page with a forward-only boundary', async () => {
    const entities = [
      transactionEntity(),
      {
        ...transactionEntity(),
        id: '2',
        statementImportId: '9',
        categoryId: null,
      },
    ];
    const query = transactionPageQuery(entities);
    const store = new TypeOrmTransactionStore(pagedEntityManager(query));

    await expect(
      store.findPageInSpace({
        spaceId: '7',
        filters: {
          fromDate: '2026-08-01',
          toDate: '2026-08-31',
          categoryId: '42',
          categoryState: 'categorized',
          statementImportId: '9',
          source: 'imported',
          description: '100%_ coffee',
          accountBank: 'BDO',
          accountCardType: 'AMEX',
        },
        after: { purchaseDate: '2026-08-15', transactionId: '100' },
        pageSize: 2,
      }),
    ).resolves.toEqual([
      { ...transactionRecord(), statementImportId: null },
      importedTransactionRecord(),
    ]);

    expect(query.where).toHaveBeenCalledWith('transaction.spaceId = :spaceId', {
      spaceId: '7',
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.deletedAt IS NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.purchaseDate >= :fromDate',
      { fromDate: '2026-08-01' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.purchaseDate <= :toDate',
      { toDate: '2026-08-31' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.categoryId = :categoryId',
      { categoryId: '42' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.categoryId IS NOT NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.statementImportId = :statementImportId',
      { statementImportId: '9' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.statementImportId IS NOT NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "transaction.description ILIKE :description ESCAPE '\\'",
      { description: '%100\\%\\_ coffee%' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('account_import.space_id = :spaceId'),
      { spaceId: '7', accountBank: 'BDO', accountCardType: 'AMEX' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      '(transaction.purchaseDate < :cursorDate OR (transaction.purchaseDate = :cursorDate AND transaction.id < :cursorId))',
      { cursorDate: '2026-08-15', cursorId: '100' },
    );
    expect(query.orderBy).toHaveBeenCalledWith(
      'transaction.purchaseDate',
      'DESC',
    );
    expect(query.addOrderBy).toHaveBeenCalledWith('transaction.id', 'DESC');
    expect(query.take).toHaveBeenCalledWith(3);
  });

  it('counts all filtered Transactions without the page cursor', async () => {
    const query = transactionPageQuery([]);
    query.getCount = jest.fn().mockResolvedValue(43);
    const store = new TypeOrmTransactionStore(pagedEntityManager(query));
    await expect(
      store.countInSpace({
        spaceId: '7',
        filters: { description: 'coffee', source: 'manual' },
        after: null,
        pageSize: 20,
      }),
    ).resolves.toBe(43);
    expect(query.andWhere).toHaveBeenCalledWith(
      'transaction.statementImportId IS NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "transaction.description ILIKE :description ESCAPE '\\'",
      { description: '%coffee%' },
    );
    expect(query.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('cursorDate'),
      expect.anything(),
    );
  });
});

function transactionalEntityManager(
  transactionRepository: object,
  categoryQuery: object,
  activityRepository: object = {
    create: jest.fn().mockReturnValue({}),
    save: jest.fn().mockResolvedValue({}),
  },
): EntityManager {
  const categoryRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(categoryQuery),
  };
  const transactionalManager = {
    getRepository: jest.fn((entity: typeof TransactionEntity) => {
      if (entity === TransactionEntity) return transactionRepository;
      if (entity === TransactionActivityEntity) return activityRepository;
      return categoryRepository;
    }),
  } as unknown as EntityManager;

  return {
    transaction: jest.fn((work: (manager: EntityManager) => unknown) =>
      work(transactionalManager),
    ),
  } as unknown as EntityManager;
}

function pagedEntityManager(query: object): EntityManager {
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(query),
  };
  return {
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as EntityManager;
}

function transactionPageQuery(entities: object[]): Record<string, jest.Mock> {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(entities),
  };
}

function categoryQueryBuilder(category: {
  isActive: boolean;
}): Record<string, jest.Mock> {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({
      id: '42',
      spaceId: '7',
      isActive: category.isActive,
    }),
  };
}

function transactionEntity() {
  return {
    id: '1',
    spaceId: '7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: null,
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    categoryMatchConfidence: null,
    importFingerprint: null,
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
    deletedAt: null,
  };
}

function transactionRecord(): ManualTransactionRecord {
  return {
    id: '1',
    spaceId: '7',
    addedByUserId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
    deletedAt: null,
  };
}

function importedTransactionRecord(): TransactionRecord {
  return {
    ...transactionRecord(),
    id: '2',
    categoryId: null,
    statementImportId: '9',
    source: 'imported',
    deletedAt: null,
  };
}
