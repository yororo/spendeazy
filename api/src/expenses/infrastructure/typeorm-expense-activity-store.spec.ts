import type { EntityManager } from 'typeorm';
import { ExpenseActivityEntity } from '../../database/entities/expense-activity.entity';
import { TypeOrmExpenseActivityStore } from './typeorm-expense-activity-store';

describe('TypeOrmExpenseActivityStore', () => {
  it('persists a creation activity record with its immutable actor and occurrence time', async () => {
    const entity = activityEntity();
    const repository = {
      create: jest.fn().mockReturnValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const store = new TypeOrmExpenseActivityStore(
      entityManagerFor(repository),
    );

    await expect(
      store.create({
        expenseId: '100',
        spaceId: '7',
        actorUserId: '8',
        type: 'created',
        occurredAt: entity.occurredAt,
      }),
    ).resolves.toEqual({
      id: '200',
      expenseId: '100',
      spaceId: '7',
      actorUserId: '8',
      type: 'created',
      occurredAt: entity.occurredAt,
    });

    expect(repository.create).toHaveBeenCalledWith({
      expenseId: '100',
      spaceId: '7',
      actorUserId: '8',
      type: 'created',
      occurredAt: entity.occurredAt,
      beforeState: null,
      afterState: null,
    });
  });

  it('reads activity only for the requested Space and Expense in event order', async () => {
    const entities = [
      activityEntity({
        id: '201',
        occurredAt: new Date('2026-08-29T00:00:02.000Z'),
      }),
      activityEntity({
        id: '200',
        occurredAt: new Date('2026-08-29T00:00:01.000Z'),
      }),
    ];
    const repository = {
      find: jest.fn().mockResolvedValue(entities),
    };
    const store = new TypeOrmExpenseActivityStore(
      entityManagerFor(repository),
    );

    await expect(store.findByExpenseInSpace('7', '100')).resolves.toEqual(
      entities.map((entity) => ({
        id: entity.id,
        expenseId: entity.expenseId,
        spaceId: entity.spaceId,
        actorUserId: entity.actorUserId,
        type: entity.type,
        occurredAt: entity.occurredAt,
      })),
    );

    expect(repository.find).toHaveBeenCalledWith({
      where: { spaceId: '7', expenseId: '100' },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });
  });

  it('maps edit snapshots from persistence', async () => {
    const entity = activityEntity({
      type: 'edited',
      beforeState: {
        categoryId: null,
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
      afterState: {
        categoryId: '42',
        purchaseDate: '2026-08-01',
        description: 'Team coffee',
        amount: '4.50',
      },
    });
    const repository = {
      find: jest.fn().mockResolvedValue([entity]),
    };
    const store = new TypeOrmExpenseActivityStore(
      entityManagerFor(repository),
    );

    await expect(store.findByExpenseInSpace('7', '100')).resolves.toEqual([
      {
        id: '200',
        expenseId: '100',
        spaceId: '7',
        actorUserId: '8',
        type: 'edited',
        occurredAt: entity.occurredAt,
        before: entity.beforeState,
        after: entity.afterState,
      },
    ]);
  });
});

function entityManagerFor(repository: object): EntityManager {
  return {
    getRepository: jest.fn((entity: typeof ExpenseActivityEntity) => {
      expect(entity).toBe(ExpenseActivityEntity);
      return repository;
    }),
  } as unknown as EntityManager;
}

function activityEntity(
  overrides: Partial<ExpenseActivityEntity> = {},
): ExpenseActivityEntity {
  return {
    id: '200',
    expenseId: '100',
    spaceId: '7',
    actorUserId: '8',
    type: 'created',
    occurredAt: new Date('2026-08-29T00:00:01.000Z'),
    beforeState: null,
    afterState: null,
    ...overrides,
  };
}
