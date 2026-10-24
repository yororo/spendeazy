import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { ExpenseActivityEntity } from '../../database/entities/expense-activity.entity';
import {
  toExpenseActivitySnapshot,
  type NewExpenseActivity,
  type ExpenseActivityRecord,
  type ExpenseActivityStore,
  type ExpenseActivitySnapshot,
} from '../application/expense-activity-store';

@Injectable()
export class TypeOrmExpenseActivityStore implements ExpenseActivityStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async create(input: NewExpenseActivity): Promise<ExpenseActivityRecord> {
    const repository = this.entityManager.getRepository(ExpenseActivityEntity);
    const entity = repository.create({
      expenseId: input.expenseId,
      spaceId: input.spaceId,
      actorUserId: input.actorUserId,
      type: input.type,
      occurredAt: input.occurredAt,
      beforeState: input.before ?? null,
      afterState: input.after ?? null,
    });

    return toRecord(await repository.save(entity));
  }

  async findByExpenseInSpace(
    spaceId: string,
    expenseId: string,
  ): Promise<ExpenseActivityRecord[]> {
    const entities = await this.entityManager
      .getRepository(ExpenseActivityEntity)
      .find({
        where: { spaceId, expenseId },
        order: { occurredAt: 'ASC', id: 'ASC' },
      });

    return entities.map(toRecord);
  }
}

export function recordEditedExpenseActivity(
  entityManager: EntityManager,
  expense: ExpenseActivitySnapshot & {
    id: string;
    spaceId: string;
    updatedAt: Date;
  },
  actorUserId: string,
  before: ExpenseActivitySnapshot,
): Promise<void> {
  return new TypeOrmExpenseActivityStore(entityManager)
    .create({
      expenseId: expense.id,
      spaceId: expense.spaceId,
      actorUserId,
      type: 'edited',
      occurredAt: expense.updatedAt,
      before,
      after: toExpenseActivitySnapshot(expense),
    })
    .then(() => undefined);
}

export function recordDeletedExpenseActivity(
  entityManager: EntityManager,
  expenseId: string,
  spaceId: string,
  actorUserId: string,
  occurredAt: Date,
  before: ExpenseActivitySnapshot,
): Promise<void> {
  return new TypeOrmExpenseActivityStore(entityManager)
    .create({
      expenseId,
      spaceId,
      actorUserId,
      type: 'deleted',
      occurredAt,
      before,
    })
    .then(() => undefined);
}

function toRecord(entity: ExpenseActivityEntity): ExpenseActivityRecord {
  return {
    id: entity.id,
    expenseId: entity.expenseId,
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
