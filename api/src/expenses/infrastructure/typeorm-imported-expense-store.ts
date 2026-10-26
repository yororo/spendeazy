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
import { ExpenseEntity } from '../../database/entities/expense.entity';
import { StaleEditError } from '../../errors/application-error';
import { matchesExpenseDeletionReplay } from '../application/expense-store';
import { toExpenseActivitySnapshot } from '../application/expense-activity-store';
import {
  recordDeletedExpenseActivity,
  recordEditedExpenseActivity,
} from './typeorm-expense-activity-store';
import type {
  ImportedExpenseRecord,
  NewImportedExpense,
  SpaceImportedExpenseStore,
  UpdateImportedExpenseCategory,
  UpdateImportedExpenseInput,
} from '../application/imported-expense-store';

@Injectable()
export class TypeOrmImportedExpenseStore implements SpaceImportedExpenseStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findByFingerprintInSpace(
    spaceId: string,
    importFingerprint: string,
  ): Promise<ImportedExpenseRecord[]> {
    const entities = await this.entityManager
      .getRepository(ExpenseEntity)
      .find({
        where: importedExpenseSpaceWhere(spaceId, {
          importFingerprint,
        }),
      });

    return entities.map(toRecord);
  }

  async findByReferenceHashInSpace(
    spaceId: string,
    referenceHash: string,
  ): Promise<ImportedExpenseRecord[]> {
    const entities = await this.entityManager
      .getRepository(ExpenseEntity)
      .find({
        where: importedExpenseSpaceWhere(spaceId, {
          referenceHash,
        }),
      });

    return entities.map(toRecord);
  }

  async create(input: NewImportedExpense): Promise<ImportedExpenseRecord> {
    const entity = this.entityManager.getRepository(ExpenseEntity).create({
      spaceId: input.spaceId,
      addedByUserId: input.addedByUserId,
      categoryId: input.categoryId,
      statementImportId: input.statementImportId,
      sourceRowId: input.sourceRowId,
      expenseDate: input.expenseDate,
      description: input.description,
      amount: input.amount,
      importFingerprint: input.importFingerprint,
      referenceHash: input.referenceHash ?? null,
      deletedAt: null,
    });

    return toRecord(
      await this.entityManager.getRepository(ExpenseEntity).save(entity),
    );
  }

  async findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedExpenseRecord | null> {
    const entity = await this.entityManager
      .getRepository(ExpenseEntity)
      .findOne({ where: importedExpenseSpaceWhere(spaceId, { id }) });

    return entity ? toRecord(entity) : null;
  }

  async findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ImportedExpenseRecord | null> {
    const entity = await this.entityManager
      .getRepository(ExpenseEntity)
      .findOne({ where: importedExpenseHistoryWhere(spaceId, { id }) });

    return entity ? toRecord(entity) : null;
  }

  async updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedExpenseCategory,
    actorUserId: string,
  ): Promise<ImportedExpenseRecord | null> {
    return this.updateInSpace(
      spaceId,
      id,
      {
        categoryId: input.categoryId,
        expectedRevision: input.expectedRevision,
      },
      actorUserId,
    );
  }

  async updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateImportedExpenseInput,
    actorUserId: string,
  ): Promise<ImportedExpenseRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      const repository = entityManager.getRepository(ExpenseEntity);
      const entity = await repository.findOne({
        where: importedExpenseSpaceWhere(spaceId, { id }),
      });
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

      const result = await updateImportedExpenseIfCurrent(
        repository,
        entity.id,
        spaceId,
        input,
      );
      if (result.affected !== 1) {
        const current = await repository.findOne({
          where: importedExpenseSpaceWhere(spaceId, { id }),
        });
        if (!current) return null;
        throw new StaleEditError();
      }

      const updated = await repository.findOne({
        where: importedExpenseSpaceWhere(spaceId, { id }),
      });
      if (!updated) return null;

      const expense = toRecord(updated);
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
      const repository = entityManager.getRepository(ExpenseEntity);
      const current = await repository.findOne({
        where: importedExpenseHistoryWhere(spaceId, { id }),
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
        .andWhere('statement_import_id IS NOT NULL')
        .andWhere('space_id = :spaceId', { spaceId })
        .andWhere('deleted_at IS NULL');

      query.andWhere('revision = :expectedRevision', { expectedRevision });

      const result = await query.execute();
      if (result.affected !== 1) {
        const current = await repository.findOne({
          where: importedExpenseHistoryWhere(spaceId, { id }),
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

function importedExpenseSpaceWhere(
  spaceId: string,
  identifier: Pick<
    FindOptionsWhere<ExpenseEntity>,
    'id' | 'importFingerprint' | 'referenceHash'
  >,
): FindOptionsWhere<ExpenseEntity> {
  return {
    spaceId,
    ...identifier,
    statementImportId: Not(IsNull()),
    deletedAt: IsNull(),
  };
}

function importedExpenseHistoryWhere(
  spaceId: string,
  identifier: Pick<
    FindOptionsWhere<ExpenseEntity>,
    'id' | 'importFingerprint' | 'referenceHash'
  >,
): FindOptionsWhere<ExpenseEntity> {
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

async function updateImportedExpenseIfCurrent(
  repository: Repository<ExpenseEntity>,
  id: string,
  spaceId: string,
  input: UpdateImportedExpenseInput,
) {
  const changes: {
    categoryId?: string;
    expenseDate?: string;
    description?: string;
    amount?: string;
  } = {};
  if (input.categoryId !== undefined) changes.categoryId = input.categoryId;
  if (input.expenseDate !== undefined) {
    changes.expenseDate = input.expenseDate;
  }
  if (input.description !== undefined) {
    changes.description = input.description;
  }
  if (input.amount !== undefined) changes.amount = input.amount;

  const query = repository
    .createQueryBuilder()
    .update(ExpenseEntity)
    .set({ ...changes, revision: () => '"revision" + 1' })
    .where('id = :id', { id })
    .andWhere('statement_import_id IS NOT NULL');

  query.andWhere('space_id = :spaceId', { spaceId });
  query.andWhere('deleted_at IS NULL');

  return query
    .andWhere('revision = :expectedRevision', {
      expectedRevision: input.expectedRevision,
    })
    .execute();
}

function toRecord(entity: ExpenseEntity): ImportedExpenseRecord {
  return {
    id: entity.id,
    spaceId: entity.spaceId,
    addedByUserId: entity.addedByUserId,
    categoryId: entity.categoryId,
    statementImportId: entity.statementImportId as string,
    sourceRowId: entity.sourceRowId,
    expenseDate: entity.expenseDate,
    description: entity.description,
    amount: entity.amount,
    importFingerprint: entity.importFingerprint as string,
    referenceHash: entity.referenceHash,
    source: 'imported',
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    revision: entity.revision,
    deletedAt: entity.deletedAt,
    deletedByUserId: entity.deletedByUserId,
    deletedFromRevision: entity.deletedFromRevision,
  };
}
