import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { TransactionActivityEntity } from '../../database/entities/transaction-activity.entity';
import {
  toTransactionActivitySnapshot,
  type NewTransactionActivity,
  type TransactionActivityRecord,
  type TransactionActivityStore,
  type TransactionActivitySnapshot,
} from '../application/transaction-activity-store';

@Injectable()
export class TypeOrmTransactionActivityStore implements TransactionActivityStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async create(
    input: NewTransactionActivity,
  ): Promise<TransactionActivityRecord> {
    const repository = this.entityManager.getRepository(
      TransactionActivityEntity,
    );
    const entity = repository.create({
      transactionId: input.transactionId,
      spaceId: input.spaceId,
      actorUserId: input.actorUserId,
      type: input.type,
      occurredAt: input.occurredAt,
      beforeState: input.before ?? null,
      afterState: input.after ?? null,
    });

    return toRecord(await repository.save(entity));
  }

  async findByTransactionInSpace(
    spaceId: string,
    transactionId: string,
  ): Promise<TransactionActivityRecord[]> {
    const entities = await this.entityManager
      .getRepository(TransactionActivityEntity)
      .find({
        where: { spaceId, transactionId },
        order: { occurredAt: 'ASC', id: 'ASC' },
      });

    return entities.map(toRecord);
  }
}

export function recordEditedTransactionActivity(
  entityManager: EntityManager,
  transaction: TransactionActivitySnapshot & {
    id: string;
    spaceId: string;
    updatedAt: Date;
  },
  actorUserId: string,
  before: TransactionActivitySnapshot,
): Promise<void> {
  return new TypeOrmTransactionActivityStore(entityManager)
    .create({
      transactionId: transaction.id,
      spaceId: transaction.spaceId,
      actorUserId,
      type: 'edited',
      occurredAt: transaction.updatedAt,
      before,
      after: toTransactionActivitySnapshot(transaction),
    })
    .then(() => undefined);
}

function toRecord(
  entity: TransactionActivityEntity,
): TransactionActivityRecord {
  return {
    id: entity.id,
    transactionId: entity.transactionId,
    spaceId: entity.spaceId,
    actorUserId: entity.actorUserId,
    type: entity.type,
    occurredAt: entity.occurredAt,
    ...(entity.beforeState === null || entity.beforeState === undefined
      ? {}
      : { before: entity.beforeState }),
    ...(entity.afterState === null || entity.afterState === undefined
      ? {}
      : { after: entity.afterState }),
  };
}
