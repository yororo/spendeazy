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
import type {
  ImportedTransactionRecord,
  NewImportedTransaction,
  SpaceImportedTransactionStore,
  UpdateImportedTransactionCategory,
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

  async updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedTransactionCategory,
  ): Promise<ImportedTransactionRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(TransactionEntity);
      const entity = await repository.findOne({
        where: importedTransactionSpaceWhere(spaceId, { id }),
      });
      if (!entity) return null;

      if (input.categoryId !== null && input.categoryId !== entity.categoryId) {
        await ensureActiveCategoryInSpace(
          entityManager,
          spaceId,
          input.categoryId,
        );
      }

      if (input.expectedUpdatedAt !== undefined) {
        const result = await updateCategoryIfCurrent(
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
        return updated ? toRecord(updated) : null;
      }

      entity.categoryId = input.categoryId;
      entity.categoryMatchConfidence = null;
      return toRecord(await repository.save(entity));
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

async function updateCategoryIfCurrent(
  repository: Repository<TransactionEntity>,
  id: string,
  spaceId: string,
  input: UpdateImportedTransactionCategory,
) {
  const query = repository
    .createQueryBuilder()
    .update(TransactionEntity)
    .set({
      categoryId: input.categoryId,
      categoryMatchConfidence: null,
    })
    .where('id = :id', { id })
    .andWhere('statement_import_id IS NOT NULL');

  query.andWhere('space_id = :spaceId', { spaceId });

  return query
    .andWhere('updated_at = :expectedUpdatedAt', {
      expectedUpdatedAt: new Date(input.expectedUpdatedAt!),
    })
    .execute();
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
  };
}
