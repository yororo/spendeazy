import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { TransactionActivityEntity } from '../../database/entities/transaction-activity.entity';
import type {
  NewTransactionActivity,
  TransactionActivityRecord,
  TransactionActivityStore,
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
  };
}
