import type { EntityManager } from 'typeorm';
import { CategoryInactiveError } from '../../categories/application/category-errors';
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
    const categoryQuery = categoryQueryBuilder({ isActive: true });
    const entityManager = transactionalEntityManager(
      transactionRepository,
      categoryQuery,
    );
    const store = new TypeOrmTransactionStore(entityManager);

    await expect(
      store.create({
        userId: '7',
        categoryId: '42',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      }),
    ).resolves.toEqual(transactionRecord());

    expect(transactionRepository.create).toHaveBeenCalledWith({
      userId: '7',
      categoryId: '42',
      statementImportId: null,
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      categoryMatchConfidence: null,
      importFingerprint: null,
    });
    expect(categoryQuery.setLock).toHaveBeenCalledWith('pessimistic_read');
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
      store.create({
        userId: '7',
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
    const categoryQuery = categoryQueryBuilder({ isActive: true });
    const store = new TypeOrmTransactionStore(
      transactionalEntityManager(transactionRepository, categoryQuery),
    );

    await expect(
      store.update('7', '1', {
        categoryId: '43',
        purchaseDate: '2026-08-02',
        description: 'Dinner',
        amount: '12.99',
      }),
    ).resolves.toEqual({
      ...transactionRecord(),
      categoryId: '43',
      purchaseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
    });

    expect(transactionRepository.save).toHaveBeenCalledWith(entity);
    expect(categoryQuery.setLock).toHaveBeenCalledWith('pessimistic_read');
  });

  it('reports whether an owned manual transaction was removed', async () => {
    const transactionRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const store = new TypeOrmTransactionStore(
      entityManagerFor(transactionRepository),
    );

    await expect(store.delete('7', '1')).resolves.toBe(true);
    expect(transactionRepository.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', userId: '7' }),
    );
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
      store.findPage({
        userId: '7',
        filters: {
          fromDate: '2026-08-01',
          toDate: '2026-08-31',
          categoryId: '42',
          categoryState: 'categorized',
          statementImportId: '9',
          source: 'imported',
        },
        after: { purchaseDate: '2026-08-15', transactionId: '100' },
        pageSize: 2,
      }),
    ).resolves.toEqual([
      { ...transactionRecord(), statementImportId: null },
      importedTransactionRecord(),
    ]);

    expect(query.where).toHaveBeenCalledWith('transaction.userId = :userId', {
      userId: '7',
    });
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
});

function entityManagerFor(repository: object): EntityManager {
  return {
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as EntityManager;
}

function transactionalEntityManager(
  transactionRepository: object,
  categoryQuery: object,
): EntityManager {
  const categoryRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(categoryQuery),
  };
  const transactionalManager = {
    getRepository: jest.fn((entity: typeof TransactionEntity) =>
      entity === TransactionEntity ? transactionRepository : categoryRepository,
    ),
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
      userId: '7',
      isActive: category.isActive,
    }),
  };
}

function transactionEntity() {
  return {
    id: '1',
    userId: '7',
    categoryId: '42',
    statementImportId: null,
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    categoryMatchConfidence: null,
    importFingerprint: null,
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}

function transactionRecord(): ManualTransactionRecord {
  return {
    id: '1',
    userId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}

function importedTransactionRecord(): TransactionRecord {
  return {
    ...transactionRecord(),
    id: '2',
    categoryId: null,
    statementImportId: '9',
    source: 'imported',
  };
}
