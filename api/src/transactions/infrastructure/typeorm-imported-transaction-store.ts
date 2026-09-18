import {
  IsNull,
  Not,
  type EntityManager,
  type FindOptionsWhere,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { assertActiveCategory } from '../../categories/application/active-category';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import type {
  ImportedTransactionRecord,
  ImportedTransactionStore,
  NewImportedTransaction,
  UpdateImportedTransactionCategory,
} from '../application/imported-transaction-store';

@Injectable()
export class TypeOrmImportedTransactionStore implements ImportedTransactionStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findByFingerprint(
    userId: string,
    importFingerprint: string,
  ): Promise<ImportedTransactionRecord[]> {
    const entities = await this.entityManager
      .getRepository(TransactionEntity)
      .find({
        where: importedTransactionWhere(userId, { importFingerprint }),
      });

    return entities.map(toRecord);
  }

  async create(
    input: NewImportedTransaction,
  ): Promise<ImportedTransactionRecord> {
    const entity = this.entityManager.getRepository(TransactionEntity).create({
      userId: input.userId,
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

  async findById(
    userId: string,
    id: string,
  ): Promise<ImportedTransactionRecord | null> {
    const entity = await this.entityManager
      .getRepository(TransactionEntity)
      .findOne({ where: importedTransactionWhere(userId, { id }) });

    return entity ? toRecord(entity) : null;
  }

  async updateCategory(
    userId: string,
    id: string,
    input: UpdateImportedTransactionCategory,
  ): Promise<ImportedTransactionRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(TransactionEntity);
      const entity = await repository.findOne({
        where: importedTransactionWhere(userId, { id }),
      });
      if (!entity) {
        return null;
      }

      if (input.categoryId !== null && input.categoryId !== entity.categoryId) {
        await ensureActiveCategory(entityManager, userId, input.categoryId);
      }

      entity.categoryId = input.categoryId;
      entity.categoryMatchConfidence = null;
      return toRecord(await repository.save(entity));
    });
  }
}

function importedTransactionWhere(
  userId: string,
  identifier: Pick<
    FindOptionsWhere<TransactionEntity>,
    'id' | 'importFingerprint'
  >,
): FindOptionsWhere<TransactionEntity> {
  return {
    userId,
    ...identifier,
    statementImportId: Not(IsNull()),
  };
}

async function ensureActiveCategory(
  entityManager: EntityManager,
  userId: string,
  categoryId: string,
): Promise<void> {
  const category = await entityManager
    .getRepository(CategoryEntity)
    .createQueryBuilder('category')
    .where('category.id = :categoryId', { categoryId })
    .andWhere('category.user_id = :userId', { userId })
    .setLock('pessimistic_read')
    .getOne();

  assertActiveCategory(category);
}

function toRecord(entity: TransactionEntity): ImportedTransactionRecord {
  return {
    id: entity.id,
    userId: entity.userId,
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
