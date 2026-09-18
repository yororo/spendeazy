import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import {
  IsNull,
  QueryFailedError,
  type EntityManager,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { POSTGRES_FOREIGN_KEY_VIOLATION } from '../../database/database-error-codes';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { UserNotFoundError } from '../../users/application/user-errors';
import type {
  ManualTransactionRecord,
  NewManualTransaction,
  TransactionPageQuery,
  TransactionRecord,
  TransactionStore,
  UpdateManualTransaction,
} from '../application/transaction-store';

const TRANSACTION_CATEGORY_FOREIGN_KEY = 'fk_transactions_category_user';
const TRANSACTION_USER_FOREIGN_KEY = 'fk_transactions_user';

@Injectable()
export class TypeOrmTransactionStore implements TransactionStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findById(
    userId: string,
    id: string,
  ): Promise<ManualTransactionRecord | null> {
    const entity = await this.entityManager
      .getRepository(TransactionEntity)
      .findOne({ where: manualTransactionWhere(userId, id) });

    return entity ? toManualTransactionRecord(entity) : null;
  }

  async findPage(query: TransactionPageQuery): Promise<TransactionRecord[]> {
    const transactionQuery = this.entityManager
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: query.userId });

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

  async create(input: NewManualTransaction): Promise<ManualTransactionRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      if (input.categoryId !== null) {
        await ensureActiveCategory(
          entityManager,
          input.userId,
          input.categoryId,
        );
      }

      const repository = entityManager.getRepository(TransactionEntity);
      const entity = repository.create({
        userId: input.userId,
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

  async update(
    userId: string,
    id: string,
    input: UpdateManualTransaction,
  ): Promise<ManualTransactionRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(TransactionEntity);
      const entity = await repository.findOne({
        where: manualTransactionWhere(userId, id),
      });
      if (!entity) {
        return null;
      }

      if (
        input.categoryId !== undefined &&
        input.categoryId !== null &&
        input.categoryId !== entity.categoryId
      ) {
        await ensureActiveCategory(entityManager, userId, input.categoryId);
      }

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

      return saveManualTransaction(repository, entity);
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.entityManager
      .getRepository(TransactionEntity)
      .delete(manualTransactionWhere(userId, id));

    return result.affected === 1;
  }
}

function manualTransactionWhere(
  userId: string,
  id: string,
): FindOptionsWhere<TransactionEntity> {
  return { id, userId, statementImportId: IsNull() };
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
    userId: entity.userId,
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
  if (constraint === TRANSACTION_CATEGORY_FOREIGN_KEY) {
    return new CategoryNotFoundError();
  }
  if (constraint === TRANSACTION_USER_FOREIGN_KEY) {
    return new UserNotFoundError();
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
