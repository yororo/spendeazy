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
      purchaseDate: input.purchaseDate,
      description: input.description,
      amount: input.amount,
      categoryMatchConfidence: input.categoryMatchConfidence,
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

      if (input.expectedUpdatedAt !== undefined) {
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
      }

      applyImportedExpenseChanges(entity, input);
      const expense = toRecord(await repository.save(entity));
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
          where: importedExpenseSpaceWhere(spaceId, { id }),
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
    .update(ExpenseEntity)
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

function applyImportedExpenseChanges(
  entity: ExpenseEntity,
  input: UpdateImportedExpenseInput,
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

function toRecord(entity: ExpenseEntity): ImportedExpenseRecord {
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
    referenceHash: entity.referenceHash,
    source: 'imported',
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  };
}
