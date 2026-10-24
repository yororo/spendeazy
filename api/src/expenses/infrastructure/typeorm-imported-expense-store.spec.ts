import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { ExpenseActivityEntity } from '../../database/entities/expense-activity.entity';
import { ExpenseEntity } from '../../database/entities/expense.entity';
import { TypeOrmImportedExpenseStore } from './typeorm-imported-expense-store';

describe('TypeOrmImportedExpenseStore', () => {
  it('records an edit with before-and-after values and the editing actor', async () => {
    const entity = importedExpenseEntity();
    const updatedEntity = { ...entity, categoryId: '43', revision: '2' };
    const updateQuery = expenseUpdateQuery();
    const expenseRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(entity)
        .mockResolvedValueOnce(updatedEntity),
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
    };
    const categoryQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: '43',
        spaceId: '7',
        isActive: true,
      }),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };
    const store = new TypeOrmImportedExpenseStore(
      transactionalEntityManager(
        expenseRepository,
        categoryQuery,
        activityRepository,
      ),
    );

    await expect(
      store.updateCategoryInSpace(
        '7',
        '1',
        { categoryId: '43', expectedRevision: '1' },
        '8',
      ),
    ).resolves.toMatchObject({
      id: '1',
      categoryId: '43',
      revision: '2',
    });

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
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    });
  });

  it('updates every supported imported field without changing provenance', async () => {
    const entity = importedExpenseEntity();
    const updatedEntity = {
      ...entity,
      categoryId: '43',
      expenseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      revision: '2',
    };
    const updateQuery = expenseUpdateQuery();
    const expenseRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(entity)
        .mockResolvedValueOnce(updatedEntity),
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
    };
    const categoryQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: '43',
        spaceId: '7',
        isActive: true,
      }),
    };
    const activityRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };
    const store = new TypeOrmImportedExpenseStore(
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
    ).resolves.toMatchObject({
      id: '1',
      addedByUserId: '7',
      statementImportId: '100',
      expenseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      categoryId: '43',
      revision: '2',
    });

    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'revision = :expectedRevision',
      { expectedRevision: '1' },
    );
    expect(activityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseId: '1',
        spaceId: '7',
        actorUserId: '8',
        type: 'edited',
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
      }),
    );
  });

  it('soft-deletes an imported Expense and records the deleting actor', async () => {
    const entity = importedExpenseEntity();
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
    const store = new TypeOrmImportedExpenseStore(
      transactionalEntityManager(expenseRepository, {}, activityRepository),
    );

    await expect(store.deleteInSpace('7', '1', '8', '1')).resolves.toBe(true);

    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'statement_import_id IS NOT NULL',
    );
    expect(updateQuery.andWhere).toHaveBeenCalledWith('space_id = :spaceId', {
      spaceId: '7',
    });
    expect(updateQuery.andWhere).toHaveBeenCalledWith('deleted_at IS NULL');
    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'revision = :expectedRevision',
      { expectedRevision: '1' },
    );
    expect(activityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseId: '1',
        spaceId: '7',
        actorUserId: '8',
        type: 'deleted',
      }),
    );
  });
});

function transactionalEntityManager(
  expenseRepository: object,
  categoryQuery: object,
  activityRepository: object,
): EntityManager {
  const categoryRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(categoryQuery),
  };
  const transactionalManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ExpenseEntity) return expenseRepository;
      if (entity === ExpenseActivityEntity) return activityRepository;
      if (entity === CategoryEntity) return categoryRepository;
      throw new Error('Unexpected repository');
    }),
  } as unknown as EntityManager;

  return {
    transaction: jest.fn((work: (manager: EntityManager) => unknown) =>
      work(transactionalManager),
    ),
  } as unknown as EntityManager;
}

function importedExpenseEntity(): ExpenseEntity {
  return {
    id: '1',
    spaceId: '7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: '100',
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    importFingerprint: 'a'.repeat(64),
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
    revision: '1',
    deletedAt: null,
  };
}

function expenseUpdateQuery(): Record<string, jest.Mock> {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}
