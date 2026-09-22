import {
  IsNull,
  Not,
  type EntityManager,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { assertActiveCategory } from '../../categories/application/active-category';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { StaleEditError } from '../../errors/application-error';
import { toTransactionActivitySnapshot } from '../application/transaction-activity-store';
import {
  recordDeletedTransactionActivity,
  recordEditedTransactionActivity,
} from './typeorm-transaction-activity-store';
import type {
  ImportedTransactionRecord,
  NewImportedTransaction,
  SpaceImportedTransactionStore,
  UpdateImportedTransactionCategory,
  UpdateImportedTransactionInput,
} from '../application/imported-transaction-store';

@Injectable()
export class TypeOrmImportedTransactionStore implements SpaceImportedTransactionStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findByFingerprintInSpace(
    spaceId: string,
    importFingerprint: string,
  ): Promise<ImportedTransactionRecord[]> {
    const entities = await this.entityManager
      .getRepository(TransactionEntity)
      .find({
        where: importedTransactionSpaceWhere(spaceId, {
          importFingerprint,
        }),
      });

    return entities.map(toRecord);
  }

  async create(
    input: NewImportedTransaction,
  ): Promise<ImportedTransactionRecord> {
    const entity = this.entityManager.getRepository(TransactionEntity).create({
      spaceId: input.spaceId,
      addedByUserId: input.addedByUserId,
      categoryId: input.categoryId,
      statementImportId: input.statementImportId,
      purchaseDate: input.purchaseDate,
      description: input.description,
      amount: input.amount,
      categoryMatchConfidence: input.categoryMatchConfidence,
      importFingerprint: input.importFingerprint,
      deletedAt: null,
    });

    return toRecord(
      await this.entityManager.getRepository(TransactionEntity).save(entity),
    );
  }

  async findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null> {
    const entity = await this.entityManager
      .getRepository(TransactionEntity)
      .findOne({ where: importedTransactionSpaceWhere(spaceId, { id }) });

    return entity ? toRecord(entity) : null;
  }

  async findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null> {
    const entity = await this.entityManager
      .getRepository(TransactionEntity)
      .findOne({ where: importedTransactionHistoryWhere(spaceId, { id }) });

    return entity ? toRecord(entity) : null;
  }

  async updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedTransactionCategory,
    actorUserId: string,
  ): Promise<ImportedTransactionRecord | null> {
    return this.updateInSpace(
      spaceId,
      id,
      {
        categoryId: input.categoryId,
        ...(input.expectedUpdatedAt === undefined
          ? {}
          : { expectedUpdatedAt: input.expectedUpdatedAt }),
      },
      actorUserId,
    );
  }

  async updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedTransactionInput,
    actorUserId: string,
  ): Promise<ImportedTransactionRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(TransactionEntity);
      const entity = await repository.findOne({
        where: importedTransactionSpaceWhere(spaceId, { id }),
      });
      if (!entity) return null;
      const before = toTransactionActivitySnapshot(entity);

      if (
        input.categoryId !== undefined &&
        input.categoryId !== null &&
        input.categoryId !== entity.categoryId
      ) {
        await ensureActiveCategoryInSpace(
          entityManager,
          spaceId,
          input.categoryId,
        );
      }

      if (input.expectedUpdatedAt !== undefined) {
        const result = await updateImportedTransactionIfCurrent(
          repository,
          entity.id,
          spaceId,
          input,
        );
        if (result.affected !== 1) {
          const current = await repository.findOne({
            where: importedTransactionSpaceWhere(spaceId, { id }),
          });
          if (!current) return null;
          throw new StaleEditError();
        }

        const updated = await repository.findOne({
          where: importedTransactionSpaceWhere(spaceId, { id }),
        });
        if (!updated) return null;

        const transaction = toRecord(updated);
        await recordEditedTransactionActivity(
          entityManager,
          transaction,
          actorUserId,
          before,
        );
        return transaction;
      }

      applyImportedTransactionChanges(entity, input);
      const transaction = toRecord(await repository.save(entity));
      await recordEditedTransactionActivity(
        entityManager,
        transaction,
        actorUserId,
        before,
      );
      return transaction;
    });
  }

  async deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(TransactionEntity);
      const deletedAt = new Date();
      const query = repository
        .createQueryBuilder()
        .update(TransactionEntity)
        .set({ deletedAt })
        .where('id = :id', { id })
        .andWhere('statement_import_id IS NOT NULL')
        .andWhere('space_id = :spaceId', { spaceId })
        .andWhere('deleted_at IS NULL');

      if (expectedUpdatedAt !== undefined) {
        query.andWhere('updated_at = :expectedUpdatedAt', {
          expectedUpdatedAt: new Date(expectedUpdatedAt),
        });
      }

      const result = await query.execute();
      if (result.affected !== 1) {
        const current = await repository.findOne({
          where: importedTransactionSpaceWhere(spaceId, { id }),
        });
        if (current && expectedUpdatedAt !== undefined) {
          throw new StaleEditError();
        }
        return false;
      }

      await recordDeletedTransactionActivity(
        entityManager,
        id,
        spaceId,
        actorUserId,
        deletedAt,
      );
      return true;
    });
  }
}

function importedTransactionSpaceWhere(
  spaceId: string,
  identifier: Pick<
    FindOptionsWhere<TransactionEntity>,
    'id' | 'importFingerprint'
  >,
): FindOptionsWhere<TransactionEntity> {
  return {
    spaceId,
    ...identifier,
    statementImportId: Not(IsNull()),
    deletedAt: IsNull(),
  };
}

function importedTransactionHistoryWhere(
  spaceId: string,
  identifier: Pick<
    FindOptionsWhere<TransactionEntity>,
    'id' | 'importFingerprint'
  >,
): FindOptionsWhere<TransactionEntity> {
  return {
    spaceId,
    ...identifier,
    statementImportId: Not(IsNull()),
  };
}

async function ensureActiveCategoryInSpace(
  entityManager: EntityManager,
  spaceId: string,
  categoryId: string,
): Promise<void> {
  const category = await entityManager
    .getRepository(CategoryEntity)
    .createQueryBuilder('category')
    .where('category.id = :categoryId', { categoryId })
    .andWhere('category.space_id = :spaceId', { spaceId })
    .setLock('pessimistic_read')
    .getOne();

  assertActiveCategory(category);
}

async function updateImportedTransactionIfCurrent(
  repository: Repository<TransactionEntity>,
  id: string,
  spaceId: string,
  input: UpdateImportedTransactionInput,
) {
  const changes: {
    categoryId?: string | null;
    purchaseDate?: string;
    description?: string;
    amount?: string;
    categoryMatchConfidence: null;
  } = {
    categoryMatchConfidence: null,
  };
  if (input.categoryId !== undefined) changes.categoryId = input.categoryId;
  if (input.purchaseDate !== undefined) {
    changes.purchaseDate = input.purchaseDate;
  }
  if (input.description !== undefined) {
    changes.description = input.description;
  }
  if (input.amount !== undefined) changes.amount = input.amount;

  const query = repository
    .createQueryBuilder()
    .update(TransactionEntity)
    .set(changes)
    .where('id = :id', { id })
    .andWhere('statement_import_id IS NOT NULL');

  query.andWhere('space_id = :spaceId', { spaceId });
  query.andWhere('deleted_at IS NULL');

  return query
    .andWhere('updated_at = :expectedUpdatedAt', {
      expectedUpdatedAt: new Date(input.expectedUpdatedAt!),
    })
    .execute();
}

function applyImportedTransactionChanges(
  entity: TransactionEntity,
  input: UpdateImportedTransactionInput,
): void {
  if (input.categoryId !== undefined) entity.categoryId = input.categoryId;
  if (input.purchaseDate !== undefined) {
    entity.purchaseDate = input.purchaseDate;
  }
  if (input.description !== undefined) {
    entity.description = input.description;
  }
  if (input.amount !== undefined) entity.amount = input.amount;
  entity.categoryMatchConfidence = null;
}

function toRecord(entity: TransactionEntity): ImportedTransactionRecord {
  return {
    id: entity.id,
    spaceId: entity.spaceId,
    addedByUserId: entity.addedByUserId,
    categoryId: entity.categoryId,
    statementImportId: entity.statementImportId as string,
    purchaseDate: entity.purchaseDate,
    description: entity.description,
    amount: entity.amount,
    categoryMatchConfidence: entity.categoryMatchConfidence,
    importFingerprint: entity.importFingerprint as string,
    source: 'imported',
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  };
}
