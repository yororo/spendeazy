import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import {
  IsNull,
  QueryFailedError,
  type EntityManager,
  type FindOptionsWhere,
  type Repository,
  type SelectQueryBuilder,
  type UpdateResult,
} from 'typeorm';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { POSTGRES_FOREIGN_KEY_VIOLATION } from '../../database/database-error-codes';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { StaleEditError } from '../../errors/application-error';
import type {
  ManualTransactionRecord,
  NewManualTransaction,
  SpaceTransactionStore,
  SpaceTransactionPageQuery,
  TransactionRecord,
  UpdateManualTransaction,
} from '../application/transaction-store';

const TRANSACTION_SPACE_CATEGORY_FOREIGN_KEY = 'fk_transactions_category_space';

@Injectable()
export class TypeOrmTransactionStore implements SpaceTransactionStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualTransactionRecord | null> {
    const entity = await this.entityManager
      .getRepository(TransactionEntity)
      .findOne({ where: manualTransactionSpaceWhere(spaceId, id) });

    return entity ? toManualTransactionRecord(entity) : null;
  }

  async findPageInSpace(
    query: SpaceTransactionPageQuery,
  ): Promise<TransactionRecord[]> {
    const transactionQuery = this.entityManager
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .where('transaction.spaceId = :spaceId', { spaceId: query.spaceId });

    return this.applyPageQuery(transactionQuery, query);
  }

  private async applyPageQuery(
    transactionQuery: SelectQueryBuilder<TransactionEntity>,
    query: SpaceTransactionPageQuery,
  ): Promise<TransactionRecord[]> {
    if (query.filters.fromDate !== undefined) {
      transactionQuery.andWhere('transaction.purchaseDate >= :fromDate', {
        fromDate: query.filters.fromDate,
      });
    }
    if (query.filters.toDate !== undefined) {
      transactionQuery.andWhere('transaction.purchaseDate <= :toDate', {
        toDate: query.filters.toDate,
      });
    }
    if (query.filters.categoryId !== undefined) {
      transactionQuery.andWhere('transaction.categoryId = :categoryId', {
        categoryId: query.filters.categoryId,
      });
    }
    if (query.filters.categoryState === 'categorized') {
      transactionQuery.andWhere('transaction.categoryId IS NOT NULL');
    }
    if (query.filters.categoryState === 'uncategorized') {
      transactionQuery.andWhere('transaction.categoryId IS NULL');
    }
    if (query.filters.statementImportId !== undefined) {
      transactionQuery.andWhere(
        'transaction.statementImportId = :statementImportId',
        { statementImportId: query.filters.statementImportId },
      );
    }
    if (query.filters.source === 'manual') {
      transactionQuery.andWhere('transaction.statementImportId IS NULL');
    }
    if (query.filters.source === 'imported') {
      transactionQuery.andWhere('transaction.statementImportId IS NOT NULL');
    }
    if (query.after) {
      transactionQuery.andWhere(
        '(transaction.purchaseDate < :cursorDate OR (transaction.purchaseDate = :cursorDate AND transaction.id < :cursorId))',
        {
          cursorDate: query.after.purchaseDate,
          cursorId: query.after.transactionId,
        },
      );
    }

    const entities = await transactionQuery
      .orderBy('transaction.purchaseDate', 'DESC')
      .addOrderBy('transaction.id', 'DESC')
      .take(query.pageSize + 1)
      .getMany();

    return entities.map(toTransactionRecord);
  }

  async createInSpace(
    input: NewManualTransaction,
  ): Promise<ManualTransactionRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      if (input.categoryId !== null) {
        await ensureActiveCategoryInSpace(
          entityManager,
          input.spaceId,
          input.categoryId,
        );
      }

      const repository = entityManager.getRepository(TransactionEntity);
      const entity = repository.create({
        spaceId: input.spaceId,
        addedByUserId: input.addedByUserId,
        categoryId: input.categoryId,
        statementImportId: null,
        purchaseDate: input.purchaseDate,
        description: input.description,
        amount: input.amount,
        categoryMatchConfidence: null,
        importFingerprint: null,
      });

      return saveManualTransaction(repository, entity);
    });
  }

  async updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(TransactionEntity);
      const where = manualTransactionSpaceWhere(spaceId, id);
      const entity = await repository.findOne({ where });
      if (!entity) return null;

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
        const result = await updateManualTransactionIfCurrent(
          repository,
          id,
          spaceId,
          input,
        );
        if (result.affected !== 1) {
          const current = await repository.findOne({ where });
          if (!current) return null;
          throw new StaleEditError();
        }

        const updated = await repository.findOne({ where });
        return updated ? toManualTransactionRecord(updated) : null;
      }

      applyManualTransactionChanges(entity, input);
      return saveManualTransaction(repository, entity);
    });
  }

  async deleteInSpace(
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean> {
    const repository = this.entityManager.getRepository(TransactionEntity);
    const where = manualTransactionSpaceWhere(spaceId, id);
    const result = await repository.delete(
      expectedUpdatedAt === undefined
        ? where
        : { ...where, updatedAt: new Date(expectedUpdatedAt) },
    );

    if (result.affected === 1 || expectedUpdatedAt === undefined) {
      return result.affected === 1;
    }

    const current = await repository.findOne({ where });
    if (current) throw new StaleEditError();
    return false;
  }
}

function applyManualTransactionChanges(
  entity: TransactionEntity,
  input: UpdateManualTransaction,
): void {
  if (input.categoryId !== undefined) {
    entity.categoryId = input.categoryId;
  }
  if (input.purchaseDate !== undefined) {
    entity.purchaseDate = input.purchaseDate;
  }
  if (input.description !== undefined) {
    entity.description = input.description;
  }
  if (input.amount !== undefined) {
    entity.amount = input.amount;
  }
}

async function updateManualTransactionIfCurrent(
  repository: Repository<TransactionEntity>,
  id: string,
  spaceId: string,
  input: UpdateManualTransaction,
): Promise<UpdateResult> {
  const changes = { ...input };
  delete changes.expectedUpdatedAt;

  const query = repository
    .createQueryBuilder()
    .update(TransactionEntity)
    .set(changes)
    .where('id = :id', { id })
    .andWhere('statement_import_id IS NULL');

  query.andWhere('space_id = :spaceId', { spaceId });

  return query
    .andWhere('updated_at = :expectedUpdatedAt', {
      expectedUpdatedAt: new Date(input.expectedUpdatedAt!),
    })
    .execute();
}

function manualTransactionSpaceWhere(
  spaceId: string,
  id: string,
): FindOptionsWhere<TransactionEntity> {
  return { id, spaceId, statementImportId: IsNull() };
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

  if (!category) {
    throw new CategoryNotFoundError();
  }
  if (!category.isActive) {
    throw new CategoryInactiveError();
  }
}

async function saveManualTransaction(
  repository: Repository<TransactionEntity>,
  entity: TransactionEntity,
): Promise<ManualTransactionRecord> {
  try {
    return toManualTransactionRecord(await repository.save(entity));
  } catch (error: unknown) {
    throw mapTransactionStoreError(error);
  }
}

function toManualTransactionRecord(
  entity: TransactionEntity,
): ManualTransactionRecord {
  return {
    ...toTransactionFields(entity),
    source: 'manual',
  };
}

function toTransactionRecord(entity: TransactionEntity): TransactionRecord {
  return {
    ...toTransactionFields(entity),
    statementImportId: entity.statementImportId,
    source: entity.statementImportId === null ? 'manual' : 'imported',
  };
}

function toTransactionFields(
  entity: TransactionEntity,
): Omit<TransactionRecord, 'statementImportId' | 'source'> {
  return {
    id: entity.id,
    spaceId: entity.spaceId,
    addedByUserId: entity.addedByUserId,
    categoryId: entity.categoryId,
    purchaseDate: entity.purchaseDate,
    description: entity.description,
    amount: entity.amount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function mapTransactionStoreError(error: unknown): unknown {
  if (!isForeignKeyViolation(error)) {
    return error;
  }

  const constraint = (error.driverError as { constraint?: unknown }).constraint;
  if (constraint === TRANSACTION_SPACE_CATEGORY_FOREIGN_KEY) {
    return new CategoryNotFoundError();
  }

  return error;
}

function isForeignKeyViolation(error: unknown): error is QueryFailedError {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_FOREIGN_KEY_VIOLATION;
}
