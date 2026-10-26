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
import { prepareWritableSpace } from '../../spaces/infrastructure/space-write-guard';
import { matchesExpenseDeletionReplay } from '../application/expense-store';
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

  async sumAmountInSpace(query: SpaceExpensePageQuery): Promise<string> {
    const expenseQuery = this.entityManager
      .getRepository(ExpenseEntity)
      .createQueryBuilder('expense')
      .where('expense.spaceId = :spaceId', { spaceId: query.spaceId });
    this.applyFilters(expenseQuery, query);
    const result = await expenseQuery
      .select('COALESCE(SUM(expense.amount), 0.00)::text', 'totalAmount')
      .getRawOne<{ totalAmount?: string }>();
    return result?.totalAmount ?? '0.00';
  }

  private async applyPageQuery(
    expenseQuery: SelectQueryBuilder<ExpenseEntity>,
    query: SpaceExpensePageQuery,
  ): Promise<ExpenseRecord[]> {
    this.applyFilters(expenseQuery, query);
    if (query.after) {
      if (query.deletedOnly && 'deletedAt' in query.after) {
        expenseQuery.andWhere(
          '(expense.deletedAt < :cursorDate OR (expense.deletedAt = :cursorDate AND expense.id < :cursorId))',
          {
            cursorDate: query.after.deletedAt,
            cursorId: query.after.expenseId,
          },
        );
      } else if ('expenseDate' in query.after) {
        const operator = query.filters.sort === 'oldest' ? '>' : '<';
        expenseQuery.andWhere(
          `(expense.expenseDate ${operator} :cursorDate OR (expense.expenseDate = :cursorDate AND expense.id ${operator} :cursorId))`,
          {
            cursorDate: query.after.expenseDate,
            cursorId: query.after.expenseId,
          },
        );
      }
    }

    const ordering = query.deletedOnly
      ? { column: 'expense.deletedAt', direction: 'DESC' as const }
      : {
          column: 'expense.expenseDate',
          direction:
            query.filters.sort === 'oldest'
              ? ('ASC' as const)
              : ('DESC' as const),
        };
    const entities = await expenseQuery
      .orderBy(ordering.column, ordering.direction)
      .addOrderBy('expense.id', ordering.direction)
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
      expenseQuery.andWhere('expense.expenseDate >= :fromDate', {
        fromDate: query.filters.fromDate,
      });
    }
    if (query.filters.toDate !== undefined) {
      expenseQuery.andWhere('expense.expenseDate <= :toDate', {
        toDate: query.filters.toDate,
      });
    }
    if (query.filters.categoryId !== undefined) {
      expenseQuery.andWhere('expense.categoryId = :categoryId', {
        categoryId: query.filters.categoryId,
      });
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
  }

  async createInSpace(input: NewManualExpense): Promise<ManualExpenseRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      await prepareWritableSpace(
        entityManager,
        input.spaceId,
        input.addedByUserId,
      );
      await ensureActiveCategoryInSpace(
        entityManager,
        input.spaceId,
        input.categoryId,
      );

      const repository = entityManager.getRepository(ExpenseEntity);
      const entity = repository.create({
        spaceId: input.spaceId,
        addedByUserId: input.addedByUserId,
        categoryId: input.categoryId,
        statementImportId: null,
        expenseDate: input.expenseDate,
        description: input.description,
        amount: input.amount,
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
        after: toExpenseActivitySnapshot(expense),
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
      await prepareWritableSpace(entityManager, spaceId, actorUserId);
      const repository = entityManager.getRepository(ExpenseEntity);
      const where = manualExpenseSpaceWhere(spaceId, id);
      const entity = await repository.findOne({ where });
      if (!entity) return null;
      const before = toExpenseActivitySnapshot(entity);

      if (
        input.categoryId !== undefined &&
        input.categoryId !== entity.categoryId
      ) {
        await ensureActiveCategoryInSpace(
          entityManager,
          spaceId,
          input.categoryId,
        );
      }

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
    });
  }

  async deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedRevision: string,
  ): Promise<boolean> {
    return this.entityManager.transaction(async (entityManager) => {
      await prepareWritableSpace(entityManager, spaceId, actorUserId);
      const repository = entityManager.getRepository(ExpenseEntity);
      const current = await repository.findOne({
        where: manualExpenseHistoryWhere(spaceId, id),
      });
      if (!current) return false;
      if (current.deletedAt !== null) {
        if (
          matchesExpenseDeletionReplay(current, actorUserId, expectedRevision)
        ) {
          return true;
        }
        throw new StaleEditError();
      }
      const before = toExpenseActivitySnapshot(current);
      const deletedAt = new Date();
      const query = repository
        .createQueryBuilder()
        .update(ExpenseEntity)
        .set({
          deletedAt,
          deletedByUserId: actorUserId,
          deletedFromRevision: expectedRevision,
          revision: () => '"revision" + 1',
        })
        .where('id = :id', { id })
        .andWhere('statement_import_id IS NULL')
        .andWhere('space_id = :spaceId', { spaceId })
        .andWhere('deleted_at IS NULL');

      query.andWhere('revision = :expectedRevision', { expectedRevision });

      const result = await query.execute();
      if (result.affected !== 1) {
        const current = await repository.findOne({
          where: manualExpenseHistoryWhere(spaceId, id),
        });
        if (!current) return false;
        if (
          matchesExpenseDeletionReplay(current, actorUserId, expectedRevision)
        ) {
          return true;
        }
        throw new StaleEditError();
      }

      await recordDeletedExpenseActivity(
        entityManager,
        id,
        spaceId,
        actorUserId,
        deletedAt,
        before,
      );
      return true;
    });
  }
}

async function updateManualExpenseIfCurrent(
  repository: Repository<ExpenseEntity>,
  id: string,
  spaceId: string,
  input: UpdateManualExpense,
): Promise<UpdateResult> {
  const { expectedRevision, ...changes } = input;

  const query = repository
    .createQueryBuilder()
    .update(ExpenseEntity)
    .set({ ...changes, revision: () => '"revision" + 1' })
    .where('id = :id', { id })
    .andWhere('statement_import_id IS NULL');

  query.andWhere('space_id = :spaceId', { spaceId });
  query.andWhere('deleted_at IS NULL');

  return query
    .andWhere('revision = :expectedRevision', { expectedRevision })
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
    expenseDate: entity.expenseDate,
    description: entity.description,
    amount: entity.amount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    revision: entity.revision,
    deletedAt: entity.deletedAt,
    deletedByUserId: entity.deletedByUserId,
    deletedFromRevision: entity.deletedFromRevision,
    sourceRowId: entity.sourceRowId,
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
