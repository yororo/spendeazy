import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionActivityEntity } from '../../database/entities/transaction-activity.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { TypeOrmImportedTransactionStore } from './typeorm-imported-transaction-store';

describe('TypeOrmImportedTransactionStore', () => {
  it('records an edit with before-and-after values and the editing actor', async () => {
    const entity = importedTransactionEntity();
    const transactionRepository = {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockResolvedValue(entity),
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
    const store = new TypeOrmImportedTransactionStore(
      transactionalEntityManager(
        transactionRepository,
        categoryQuery,
        activityRepository,
      ),
    );

    await expect(
      store.updateCategoryInSpace('7', '1', { categoryId: '43' }, '8'),
    ).resolves.toMatchObject({
      id: '1',
      categoryId: '43',
      categoryMatchConfidence: null,
    });

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
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    });
  });

  it('updates every supported imported field without changing provenance', async () => {
    const entity = importedTransactionEntity();
    const transactionRepository = {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockResolvedValue(entity),
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
    const store = new TypeOrmImportedTransactionStore(
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
    ).resolves.toMatchObject({
      id: '1',
      addedByUserId: '7',
      statementImportId: '100',
      purchaseDate: '2026-08-02',
      description: 'Dinner',
      amount: '12.99',
      categoryId: '43',
      categoryMatchConfidence: null,
    });

    expect(transactionRepository.save).toHaveBeenCalledWith(entity);
    expect(activityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: '1',
        spaceId: '7',
        actorUserId: '8',
        type: 'edited',
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
      }),
    );
  });

  it('soft-deletes an imported Transaction and records the deleting actor', async () => {
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
    const store = new TypeOrmImportedTransactionStore(
      transactionalEntityManager(transactionRepository, {}, activityRepository),
    );

    await expect(
      store.deleteInSpace('7', '1', '8', '2026-08-29T00:00:00.456Z'),
    ).resolves.toBe(true);

    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'statement_import_id IS NOT NULL',
    );
    expect(updateQuery.andWhere).toHaveBeenCalledWith('space_id = :spaceId', {
      spaceId: '7',
    });
    expect(updateQuery.andWhere).toHaveBeenCalledWith('deleted_at IS NULL');
    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      'updated_at = :expectedUpdatedAt',
      { expectedUpdatedAt: new Date('2026-08-29T00:00:00.456Z') },
    );
    expect(activityRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: '1',
        spaceId: '7',
        actorUserId: '8',
        type: 'deleted',
      }),
    );
  });
});

function transactionalEntityManager(
  transactionRepository: object,
  categoryQuery: object,
  activityRepository: object,
): EntityManager {
  const categoryRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(categoryQuery),
  };
  const transactionalManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === TransactionEntity) return transactionRepository;
      if (entity === TransactionActivityEntity) return activityRepository;
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

function importedTransactionEntity(): TransactionEntity {
  return {
    id: '1',
    spaceId: '7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: '100',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    categoryMatchConfidence: '0.9000',
    importFingerprint: 'a'.repeat(64),
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}
