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
import { ExpenseEntity } from '../../database/entities/expense.entity';
import { StaleEditError } from '../../errors/application-error';
import {
  recordDeletedExpenseActivity,
  recordEditedExpenseActivity,
  TypeOrmExpenseActivityStore,
} from './typeorm-expense-activity-store';
import { toExpenseActivitySnapshot } from '../application/expense-activity-store';
import type {
  ManualExpenseRecord,
  NewManualExpense,
  SpaceExpenseStore,
  SpaceExpensePageQuery,
  ExpenseRecord,
  UpdateManualExpense,
} from '../application/expense-store';

const EXPENSE_SPACE_CATEGORY_FOREIGN_KEY = 'fk_expenses_category_space';

@Injectable()
export class TypeOrmExpenseStore implements SpaceExpenseStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord | null> {
    const entity = await this.entityManager
      .getRepository(ExpenseEntity)
      .findOne({ where: manualExpenseSpaceWhere(spaceId, id) });

    return entity ? toManualExpenseRecord(entity) : null;
  }

  async findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord | null> {
    const entity = await this.entityManager
      .getRepository(ExpenseEntity)
      .findOne({ where: manualExpenseHistoryWhere(spaceId, id) });

    return entity ? toManualExpenseRecord(entity) : null;
  }

  async findPageInSpace(
    query: SpaceExpensePageQuery,
  ): Promise<ExpenseRecord[]> {
    const expenseQuery = this.entityManager
      .getRepository(ExpenseEntity)
      .createQueryBuilder('expense')
      .where('expense.spaceId = :spaceId', { spaceId: query.spaceId });

    return this.applyPageQuery(expenseQuery, query);
  }

  async countInSpace(query: SpaceExpensePageQuery): Promise<number> {
    const expenseQuery = this.entityManager
      .getRepository(ExpenseEntity)
      .createQueryBuilder('expense')
      .where('expense.spaceId = :spaceId', { spaceId: query.spaceId });
    this.applyFilters(expenseQuery, query);
    return expenseQuery.getCount();
  }

  private async applyPageQuery(
    expenseQuery: SelectQueryBuilder<ExpenseEntity>,
    query: SpaceExpensePageQuery,
  ): Promise<ExpenseRecord[]> {
    this.applyFilters(expenseQuery, query);
    if (query.after) {
      expenseQuery.andWhere(
        '(expense.purchaseDate < :cursorDate OR (expense.purchaseDate = :cursorDate AND expense.id < :cursorId))',
        {
          cursorDate: query.after.purchaseDate,
          cursorId: query.after.expenseId,
        },
      );
    }

    const entities = await expenseQuery
      .orderBy('expense.purchaseDate', 'DESC')
      .addOrderBy('expense.id', 'DESC')
      .take(query.pageSize + 1)
      .getMany();

    return entities.map(toExpenseRecord);
  }

  private applyFilters(
    expenseQuery: SelectQueryBuilder<ExpenseEntity>,
    query: SpaceExpensePageQuery,
  ): void {
    expenseQuery.andWhere(
      query.deletedOnly
        ? 'expense.deletedAt IS NOT NULL'
        : 'expense.deletedAt IS NULL',
    );

    if (query.filters.fromDate !== undefined) {
      expenseQuery.andWhere('expense.purchaseDate >= :fromDate', {
        fromDate: query.filters.fromDate,
      });
    }
    if (query.filters.toDate !== undefined) {
      expenseQuery.andWhere('expense.purchaseDate <= :toDate', {
        toDate: query.filters.toDate,
      });
    }
    if (query.filters.categoryId !== undefined) {
      expenseQuery.andWhere('expense.categoryId = :categoryId', {
        categoryId: query.filters.categoryId,
      });
    }
    if (query.filters.categoryState === 'categorized') {
      expenseQuery.andWhere('expense.categoryId IS NOT NULL');
    }
    if (query.filters.categoryState === 'uncategorized') {
      expenseQuery.andWhere('expense.categoryId IS NULL');
    }
    if (query.filters.statementImportId !== undefined) {
      expenseQuery.andWhere('expense.statementImportId = :statementImportId', {
        statementImportId: query.filters.statementImportId,
      });
    }
    if (query.filters.source === 'manual') {
      expenseQuery.andWhere('expense.statementImportId IS NULL');
    }
    if (query.filters.source === 'imported') {
      expenseQuery.andWhere('expense.statementImportId IS NOT NULL');
    }
    if (query.filters.description !== undefined) {
      const escaped = query.filters.description.replace(/[\\%_]/gu, '\\$&');
      expenseQuery.andWhere(
        "expense.description ILIKE :description ESCAPE '\\'",
        { description: `%${escaped}%` },
      );
    }
    if (query.filters.accountBank !== undefined) {
      expenseQuery.andWhere(
        "expense.statementImportId IN (SELECT account_import.id FROM statement_imports account_import WHERE account_import.space_id = :spaceId AND LOWER(account_import.bank) = LOWER(:accountBank) AND COALESCE(LOWER(account_import.card_type), '') = LOWER(:accountCardType))",
        {
          spaceId: query.spaceId,
          accountBank: query.filters.accountBank,
          accountCardType: query.filters.accountCardType ?? '',
        },
      );
    }
  }

  async createInSpace(input: NewManualExpense): Promise<ManualExpenseRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      if (input.categoryId !== null) {
        await ensureActiveCategoryInSpace(
          entityManager,
          input.spaceId,
          input.categoryId,
        );
      }

      const repository = entityManager.getRepository(ExpenseEntity);
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
        deletedAt: null,
      });

      const expense = await saveManualExpense(repository, entity);
      await new TypeOrmExpenseActivityStore(entityManager).create({
        expenseId: expense.id,
        spaceId: expense.spaceId,
        actorUserId: expense.addedByUserId,
        type: 'created',
        occurredAt: expense.createdAt,
      });
      return expense;
    });
  }

  async updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
    actorUserId: string,
  ): Promise<ManualExpenseRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(ExpenseEntity);
      const where = manualExpenseSpaceWhere(spaceId, id);
      const entity = await repository.findOne({ where });
      if (!entity) return null;
      const before = toExpenseActivitySnapshot(entity);

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
        const result = await updateManualExpenseIfCurrent(
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
        if (!updated) return null;

        const expense = toManualExpenseRecord(updated);
        await recordEditedExpenseActivity(
          entityManager,
          expense,
          actorUserId,
          before,
        );
        return expense;
      }

      applyManualExpenseChanges(entity, input);
      const expense = await saveManualExpense(repository, entity);
      await recordEditedExpenseActivity(
        entityManager,
        expense,
        actorUserId,
        before,
      );
      return expense;
    });
  }

  async deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(ExpenseEntity);
      const deletedAt = new Date();
      const query = repository
        .createQueryBuilder()
        .update(ExpenseEntity)
        .set({ deletedAt })
        .where('id = :id', { id })
        .andWhere('statement_import_id IS NULL')
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
          where: manualExpenseSpaceWhere(spaceId, id),
        });
        if (current && expectedUpdatedAt !== undefined) {
          throw new StaleEditError();
        }
        return false;
      }

      await recordDeletedExpenseActivity(
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

function applyManualExpenseChanges(
  entity: ExpenseEntity,
  input: UpdateManualExpense,
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

async function updateManualExpenseIfCurrent(
  repository: Repository<ExpenseEntity>,
  id: string,
  spaceId: string,
  input: UpdateManualExpense,
): Promise<UpdateResult> {
  const changes = { ...input };
  delete changes.expectedUpdatedAt;

  const query = repository
    .createQueryBuilder()
    .update(ExpenseEntity)
    .set(changes)
    .where('id = :id', { id })
    .andWhere('statement_import_id IS NULL');

  query.andWhere('space_id = :spaceId', { spaceId });
  query.andWhere('deleted_at IS NULL');

  return query
    .andWhere('updated_at = :expectedUpdatedAt', {
      expectedUpdatedAt: new Date(input.expectedUpdatedAt!),
    })
    .execute();
}

function manualExpenseSpaceWhere(
  spaceId: string,
  id: string,
): FindOptionsWhere<ExpenseEntity> {
  return { id, spaceId, statementImportId: IsNull(), deletedAt: IsNull() };
}

function manualExpenseHistoryWhere(
  spaceId: string,
  id: string,
): FindOptionsWhere<ExpenseEntity> {
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

async function saveManualExpense(
  repository: Repository<ExpenseEntity>,
  entity: ExpenseEntity,
): Promise<ManualExpenseRecord> {
  try {
    return toManualExpenseRecord(await repository.save(entity));
  } catch (error: unknown) {
    throw mapExpenseStoreError(error);
  }
}

function toManualExpenseRecord(entity: ExpenseEntity): ManualExpenseRecord {
  return {
    ...toExpenseFields(entity),
    source: 'manual',
  };
}

function toExpenseRecord(entity: ExpenseEntity): ExpenseRecord {
  return {
    ...toExpenseFields(entity),
    statementImportId: entity.statementImportId,
    source: entity.statementImportId === null ? 'manual' : 'imported',
  };
}

function toExpenseFields(
  entity: ExpenseEntity,
): Omit<ExpenseRecord, 'statementImportId' | 'source'> {
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
    deletedAt: entity.deletedAt,
  };
}

function mapExpenseStoreError(error: unknown): unknown {
  if (!isForeignKeyViolation(error)) {
    return error;
  }

  const constraint = (error.driverError as { constraint?: unknown }).constraint;
  if (constraint === EXPENSE_SPACE_CATEGORY_FOREIGN_KEY) {
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
