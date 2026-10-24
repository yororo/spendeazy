import type { EntityManager } from 'typeorm';
import { CategoryInactiveError } from '../../categories/application/category-errors';
import { ExpenseActivityEntity } from '../../database/entities/expense-activity.entity';
import { ExpenseEntity } from '../../database/entities/expense.entity';
import type {
  ManualExpenseRecord,
  ExpenseRecord,
} from '../application/expense-store';
import { TypeOrmExpenseStore } from './typeorm-expense-store';

describe('TypeOrmExpenseStore', () => {
  it('creates and maps a manual expense after locking its active category', async () => {
    const entity = expenseEntity();
    const expenseRepository = {
      create: jest.fn().mockReturnValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({
        id: '200',
        expenseId: '1',
        spaceId: '7',
        actorUserId: '7',
        type: 'created' as const,
        occurredAt: entity.createdAt,
      }),
      save: jest.fn().mockResolvedValue({
        id: '200',
        expenseId: '1',
        spaceId: '7',
        actorUserId: '7',
        type: 'created' as const,
        occurredAt: entity.createdAt,
      }),
    };
    const categoryQuery = categoryQueryBuilder({ isActive: true });
    const entityManager = transactionalEntityManager(
      expenseRepository,
      categoryQuery,
      activityRepository,
    );
    const store = new TypeOrmExpenseStore(entityManager);

    await expect(
      store.createInSpace({
        spaceId: '7',
        addedByUserId: '7',
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      }),
    ).resolves.toEqual(expenseRecord());

    expect(expenseRepository.create).toHaveBeenCalledWith({
      spaceId: '7',
      addedByUserId: '7',
      categoryId: '42',
      statementImportId: null,
      expenseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      importFingerprint: null,
      deletedAt: null,
    });
    expect(categoryQuery.setLock).toHaveBeenCalledWith('pessimistic_read');
    expect(activityRepository.create).toHaveBeenCalledWith({
      expenseId: '1',
      spaceId: '7',
      actorUserId: '7',
      type: 'created',
      occurredAt: entity.createdAt,
      beforeState: null,
      afterState: {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    });
  });

  it('rejects creation when the locked category is inactive', async () => {
    const expenseRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const categoryQuery = categoryQueryBuilder({ isActive: false });
    const store = new TypeOrmExpenseStore(
      transactionalEntityManager(expenseRepository, categoryQuery),
    );

    await expect(
      store.createInSpace({
        spaceId: '7',
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    expect(expenseRepository.create).not.toHaveBeenCalled();
  });

  it('updates a manual entity in place and keeps its manual-only identity', async () => {
    const entity = expenseEntity();
    const updatedEntity = {
      ...entity,
      categoryId: '43',
      expenseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      revision: '2',
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const expenseRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(entity)
        .mockResolvedValueOnce(updatedEntity),
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };
    const categoryQuery = categoryQueryBuilder({ isActive: true });
    const store = new TypeOrmExpenseStore(
      transactionalEntityManager(
        expenseRepository,
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
          expenseDate: '2026-08-02',
          description: 'Dinner',
          amount: '12.99',
          expectedRevision: '1',
        },
        '8',
      ),
    ).resolves.toEqual({
      ...expenseRecord(),
      categoryId: '43',
      expenseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      revision: '2',
    });

    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'revision = :expectedRevision',
      { expectedRevision: '1' },
    );
    expect(categoryQuery.setLock).toHaveBeenCalledWith('pessimistic_read');
    expect(activityRepository.create).toHaveBeenCalledWith({
      expenseId: '1',
      spaceId: '7',
      actorUserId: '8',
      type: 'edited',
      occurredAt: entity.updatedAt,
      beforeState: {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
      afterState: {
        categoryId: '43',
        expenseDate: '2026-08-02',
        description: 'Dinner',
        amount: '12.99',
      },
    });
  });

  it('soft-deletes a manual Expense and records the deleting actor atomically', async () => {
    const entity = expenseEntity();
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const expenseRepository = {
      findOne: jest.fn().mockResolvedValue(entity),
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };
    const store = new TypeOrmExpenseStore(
      transactionalEntityManager(
        expenseRepository,
        categoryQueryBuilder({ isActive: true }),
        activityRepository,
      ),
    );

    await expect(store.deleteInSpace('7', '1', '8', '1')).resolves.toBe(true);
    const setChanges = (
      updateQuery.set.mock.calls[0] as unknown as [{ deletedAt: unknown }]
    )[0];
    expect(setChanges.deletedAt).toBeInstanceOf(Date);
    expect(updateQuery.andWhere).toHaveBeenCalledWith('deleted_at IS NULL');
    const activityInput = (
      activityRepository.create.mock.calls[0] as unknown as [
        {
          expenseId: string;
          spaceId: string;
          actorUserId: string;
          type: string;
          occurredAt: unknown;
          beforeState: unknown;
        },
      ]
    )[0];
    expect(activityInput).toMatchObject({
      expenseId: '1',
      spaceId: '7',
      actorUserId: '8',
      type: 'deleted',
      beforeState: {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    });
    expect(activityInput.occurredAt).toBeInstanceOf(Date);
  });

  it('does not create an edit activity when the optimistic version is stale', async () => {
    const entity = expenseEntity();
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const expenseRepository = {
      findOne: jest.fn().mockResolvedValue(entity),
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
      save: jest.fn(),
    };
    const activityRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const store = new TypeOrmExpenseStore(
      transactionalEntityManager(
        expenseRepository,
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
          expectedRevision: '0',
        },
        '8',
      ),
    ).rejects.toMatchObject({ code: 'STALE_EDIT' });

    expect(activityRepository.create).not.toHaveBeenCalled();
    expect(expenseRepository.save).not.toHaveBeenCalled();
  });

  it('queries a stable filtered expense page with a forward-only boundary', async () => {
    const entities = [
      expenseEntity(),
      {
        ...expenseEntity(),
        id: '2',
        statementImportId: '9',
      },
    ];
    const query = expensePageQuery(entities);
    const store = new TypeOrmExpenseStore(pagedEntityManager(query));

    await expect(
      store.findPageInSpace({
        spaceId: '7',
        filters: {
          fromDate: '2026-08-01',
          toDate: '2026-08-31',
          categoryId: '42',
          statementImportId: '9',
          source: 'imported',
          description: '100%_ coffee',
        },
        after: { expenseDate: '2026-08-15', expenseId: '100' },
        pageSize: 2,
      }),
    ).resolves.toEqual([
      { ...expenseRecord(), statementImportId: null },
      importedExpenseRecord(),
    ]);

    expect(query.where).toHaveBeenCalledWith('expense.spaceId = :spaceId', {
      spaceId: '7',
    });
    expect(query.andWhere).toHaveBeenCalledWith('expense.deletedAt IS NULL');
    expect(query.andWhere).toHaveBeenCalledWith(
      'expense.expenseDate >= :fromDate',
      { fromDate: '2026-08-01' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'expense.expenseDate <= :toDate',
      { toDate: '2026-08-31' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'expense.categoryId = :categoryId',
      { categoryId: '42' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'expense.statementImportId = :statementImportId',
      { statementImportId: '9' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'expense.statementImportId IS NOT NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "expense.description ILIKE :description ESCAPE '\\'",
      { description: '%100\\%\\_ coffee%' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      '(expense.expenseDate < :cursorDate OR (expense.expenseDate = :cursorDate AND expense.id < :cursorId))',
      { cursorDate: '2026-08-15', cursorId: '100' },
    );
    expect(query.orderBy).toHaveBeenCalledWith('expense.expenseDate', 'DESC');
    expect(query.addOrderBy).toHaveBeenCalledWith('expense.id', 'DESC');
    expect(query.take).toHaveBeenCalledWith(3);
  });

  it('counts all filtered Expenses without the page cursor', async () => {
    const query = expensePageQuery([]);
    query.getCount = jest.fn().mockResolvedValue(43);
    const store = new TypeOrmExpenseStore(pagedEntityManager(query));
    await expect(
      store.countInSpace({
        spaceId: '7',
        filters: { description: 'coffee', source: 'manual' },
        after: null,
        pageSize: 20,
      }),
    ).resolves.toBe(43);
    expect(query.andWhere).toHaveBeenCalledWith(
      'expense.statementImportId IS NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      "expense.description ILIKE :description ESCAPE '\\'",
      { description: '%coffee%' },
    );
    expect(query.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('cursorDate'),
      expect.anything(),
    );
  });
});

function transactionalEntityManager(
  expenseRepository: object,
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
    getRepository: jest.fn((entity: typeof ExpenseEntity) => {
      if (entity === ExpenseEntity) return expenseRepository;
      if (entity === ExpenseActivityEntity) return activityRepository;
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

function expensePageQuery(entities: object[]): Record<string, jest.Mock> {
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

function expenseEntity() {
  return {
    id: '1',
    spaceId: '7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: null,
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    importFingerprint: null,
    revision: '1',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
    deletedAt: null,
  };
}

function expenseRecord(): ManualExpenseRecord {
  return {
    id: '1',
    spaceId: '7',
    addedByUserId: '7',
    categoryId: '42',
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
    revision: '1',
    deletedAt: null,
  };
}

function importedExpenseRecord(): ExpenseRecord {
  return {
    ...expenseRecord(),
    id: '2',
    statementImportId: '9',
    source: 'imported',
    deletedAt: null,
  };
}
