import type { EntityManager } from 'typeorm';
import { TransactionActivityEntity } from '../../database/entities/transaction-activity.entity';
import { TypeOrmTransactionActivityStore } from './typeorm-transaction-activity-store';

describe('TypeOrmTransactionActivityStore', () => {
  it('persists a creation activity record with its immutable actor and occurrence time', async () => {
    const entity = activityEntity();
    const repository = {
      create: jest.fn().mockReturnValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const store = new TypeOrmTransactionActivityStore(
      entityManagerFor(repository),
    );

    await expect(
      store.create({
        transactionId: '100',
        spaceId: '7',
        actorUserId: '8',
        type: 'created',
        occurredAt: entity.occurredAt,
      }),
    ).resolves.toEqual({
      id: '200',
      transactionId: '100',
      spaceId: '7',
      actorUserId: '8',
      type: 'created',
      occurredAt: entity.occurredAt,
    });

    expect(repository.create).toHaveBeenCalledWith({
      transactionId: '100',
      spaceId: '7',
      actorUserId: '8',
      type: 'created',
      occurredAt: entity.occurredAt,
    });
  });

  it('reads activity only for the requested Space and Transaction in event order', async () => {
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
    const store = new TypeOrmTransactionActivityStore(
      entityManagerFor(repository),
    );

    await expect(store.findByTransactionInSpace('7', '100')).resolves.toEqual(
      entities,
    );

    expect(repository.find).toHaveBeenCalledWith({
      where: { spaceId: '7', transactionId: '100' },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });
  });
});

function entityManagerFor(repository: object): EntityManager {
  return {
    getRepository: jest.fn((entity: typeof TransactionActivityEntity) => {
      expect(entity).toBe(TransactionActivityEntity);
      return repository;
    }),
  } as unknown as EntityManager;
}

function activityEntity(
  overrides: Partial<TransactionActivityEntity> = {},
): TransactionActivityEntity {
  return {
    id: '200',
    transactionId: '100',
    spaceId: '7',
    actorUserId: '8',
    type: 'created',
    occurredAt: new Date('2026-08-29T00:00:01.000Z'),
    ...overrides,
  };
}
