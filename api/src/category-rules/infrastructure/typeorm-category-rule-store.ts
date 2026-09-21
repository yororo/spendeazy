import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../database/database-error-codes';
import { CategoryEntity } from '../../database/entities/category.entity';
import { CategoryRuleEntity } from '../../database/entities/category-rule.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { StaleEditError } from '../../errors/application-error';
import { SpaceNotFoundError } from '../../spaces/application/space-errors';
import {
  ruleKey,
  validateReplacementConflicts,
} from '../application/category-rule-validation';
import { CategoryRulePatternConflictError } from '../application/category-rule-errors';
import type {
  CategoryRuleRecord,
  CategoryRuleCollectionRecord,
  CategoryRuleStore,
  NewCategoryRule,
  UpdateCategoryRule,
  CategoryRuleMatchType,
  NormalizedReplacementCategoryRule,
} from '../application/category-rule-store';
import { EXACT_CATEGORY_RULE_MATCH_TYPE } from '../application/category-rule-store';

@Injectable()
export class TypeOrmCategoryRuleStore implements CategoryRuleStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryRuleEntity)
      .findOne({ where: { id, spaceId } });

    return entity ? toCategoryRuleRecord(entity) : null;
  }

  async findAllInSpace(spaceId: string): Promise<CategoryRuleCollectionRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      // Serialize the collection read with mutations so rules and revision
      // describe the same committed Space state.
      const space = await lockRuleSpace(entityManager, spaceId);
      const entities = await entityManager
        .getRepository(CategoryRuleEntity)
        .find({
          where: { spaceId },
          order: { id: 'ASC' },
        });

      return {
        rules: entities.map(toCategoryRuleRecord),
        revision: space.categoryRulesRevision,
      };
    });
  }

  async findByNormalizedPatternInSpace(
    spaceId: string,
    normalizedPattern: string,
    excludingId?: string,
    matchType: CategoryRuleMatchType = EXACT_CATEGORY_RULE_MATCH_TYPE,
  ): Promise<CategoryRuleRecord | null> {
    const query = this.entityManager
      .getRepository(CategoryRuleEntity)
      .createQueryBuilder('categoryRule')
      .where('categoryRule.space_id = :spaceId', { spaceId })
      .andWhere('categoryRule.match_type = :matchType', {
        matchType,
      })
      .andWhere('categoryRule.normalized_pattern = :normalizedPattern', {
        normalizedPattern,
      });

    if (excludingId !== undefined) {
      query.andWhere('categoryRule.id <> :excludingId', { excludingId });
    }

    const entity = await query.getOne();
    return entity ? toCategoryRuleRecord(entity) : null;
  }

  async createInSpace(input: NewCategoryRule): Promise<CategoryRuleRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleSpace(entityManager, input.spaceId);
      await ensureActiveCategoryInSpace(
        entityManager,
        input.spaceId,
        input.categoryId,
      );

      const repository = entityManager.getRepository(CategoryRuleEntity);
      const entity = repository.create({
        spaceId: input.spaceId,
        categoryId: input.categoryId,
        pattern: input.pattern,
        normalizedPattern: input.normalizedPattern,
        matchType: input.matchType ?? EXACT_CATEGORY_RULE_MATCH_TYPE,
      });

      await ensurePatternAvailable(repository, entity);
      const saved = await saveCategoryRule(repository, entity);
      await bumpRuleRevision(entityManager, input.spaceId);
      return saved;
    });
  }

  async updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleSpace(entityManager, spaceId);
      const repository = entityManager.getRepository(CategoryRuleEntity);
      const entity = await repository.findOne({ where: { id, spaceId } });
      if (!entity) {
        return null;
      }
      assertCurrentVersion(entity.updatedAt, input.expectedUpdatedAt);

      const unchanged =
        (input.categoryId === undefined ||
          input.categoryId === entity.categoryId) &&
        (input.pattern === undefined || input.pattern === entity.pattern) &&
        (input.matchType === undefined || input.matchType === entity.matchType);
      if (unchanged) return toCategoryRuleRecord(entity);

      if (
        input.categoryId !== undefined &&
        input.categoryId !== entity.categoryId
      ) {
        await ensureActiveCategoryInSpace(
          entityManager,
          spaceId,
          input.categoryId,
        );
        entity.categoryId = input.categoryId;
      }
      if (input.pattern !== undefined) entity.pattern = input.pattern;
      if (input.normalizedPattern !== undefined) {
        entity.normalizedPattern = input.normalizedPattern;
      }
      if (input.matchType !== undefined) entity.matchType = input.matchType;

      await ensurePatternAvailable(repository, entity);
      const saved = await saveCategoryRule(repository, entity);
      await bumpRuleRevision(entityManager, spaceId);
      return saved;
    });
  }

  async deleteInSpace(
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<boolean> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleSpace(entityManager, spaceId);
      const repository = entityManager.getRepository(CategoryRuleEntity);
      const entity = await repository.findOne({ where: { id, spaceId } });
      if (!entity) {
        return false;
      }
      assertCurrentVersion(entity.updatedAt, expectedUpdatedAt);

      const result = await repository.delete({ id, spaceId });
      if (result.affected !== 1) {
        return false;
      }

      await bumpRuleRevision(entityManager, spaceId);
      return true;
    });
  }

  async replaceForCategoryInSpace(
    spaceId: string,
    categoryId: string,
    rules: NormalizedReplacementCategoryRule[],
    expectedRevision?: string,
  ): Promise<CategoryRuleCollectionRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      const space = await lockRuleSpace(entityManager, spaceId);
      assertRevision(space.categoryRulesRevision, expectedRevision);
      await ensureActiveCategoryInSpace(entityManager, spaceId, categoryId);

      const repository = entityManager.getRepository(CategoryRuleEntity);
      const allRules = await repository.find({
        where: { spaceId },
        order: { id: 'ASC' },
      });
      validateReplacementConflicts(
        categoryId,
        rules,
        allRules.map(toCategoryRuleRecord),
      );
      const currentRules = allRules.filter(
        (rule) => rule.categoryId === categoryId,
      );
      const currentByKey = new Map(
        currentRules.map((rule) => [ruleKey(rule), rule]),
      );
      const requestedKeys = new Set(rules.map(ruleKey));
      let changed = false;

      for (const rule of currentRules) {
        if (!requestedKeys.has(ruleKey(rule))) {
          await repository.delete({ id: rule.id, spaceId, categoryId });
          changed = true;
        }
      }
      for (const rule of rules) {
        const current = currentByKey.get(ruleKey(rule));
        if (current && current.pattern === rule.pattern) continue;
        const entity = current
          ? Object.assign(current, { pattern: rule.pattern })
          : repository.create({ spaceId, categoryId, ...rule });
        await saveCategoryRule(repository, entity);
        changed = true;
      }

      const revision = changed
        ? await bumpRuleRevision(entityManager, spaceId)
        : space.categoryRulesRevision;
      const persistedRules = await repository.find({
        where: { spaceId },
        order: { id: 'ASC' },
      });
      return {
        rules: persistedRules.map(toCategoryRuleRecord),
        revision,
      };
    });
  }
}

async function lockRuleSpace(
  entityManager: EntityManager,
  spaceId: string,
): Promise<SpaceEntity> {
  const space = await entityManager
    .getRepository(SpaceEntity)
    .createQueryBuilder('space')
    .where('space.id = :spaceId', { spaceId })
    .setLock('pessimistic_write')
    .getOne();
  if (!space) throw new SpaceNotFoundError();
  return space;
}

async function ensurePatternAvailable(
  repository: Repository<CategoryRuleEntity>,
  entity: CategoryRuleEntity,
): Promise<void> {
  const existing = await repository.findOne({
    where: {
      spaceId: entity.spaceId,
      normalizedPattern: entity.normalizedPattern,
      matchType: entity.matchType,
    },
  });
  if (existing && existing.id !== entity.id)
    throw new CategoryRulePatternConflictError(existing.categoryId);
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

async function bumpRuleRevision(
  entityManager: EntityManager,
  spaceId: string,
): Promise<string> {
  await entityManager
    .getRepository(SpaceEntity)
    .createQueryBuilder()
    .update(SpaceEntity)
    .set({ categoryRulesRevision: () => 'category_rules_revision + 1' })
    .where('id = :spaceId', { spaceId })
    .execute();
  const space = await entityManager
    .getRepository(SpaceEntity)
    .findOne({ where: { id: spaceId } });
  if (!space) throw new SpaceNotFoundError();
  return space.categoryRulesRevision;
}

function assertRevision(
  currentRevision: string,
  expectedRevision: string | undefined,
): void {
  if (expectedRevision === undefined || currentRevision === expectedRevision) {
    return;
  }

  throw new StaleEditError();
}

function assertCurrentVersion(
  updatedAt: Date,
  expectedUpdatedAt: string | undefined,
): void {
  if (expectedUpdatedAt === undefined) return;

  const expectedTime = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedTime) || updatedAt.getTime() !== expectedTime) {
    throw new StaleEditError();
  }
}

async function saveCategoryRule(
  repository: Repository<CategoryRuleEntity>,
  entity: CategoryRuleEntity,
): Promise<CategoryRuleRecord> {
  try {
    return toCategoryRuleRecord(await repository.save(entity));
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new CategoryRulePatternConflictError();
    }
    if (isForeignKeyViolation(error)) {
      throw mapForeignKeyViolation(error);
    }

    throw error;
  }
}

function toCategoryRuleRecord(entity: CategoryRuleEntity): CategoryRuleRecord {
  return {
    id: entity.id,
    spaceId: entity.spaceId,
    categoryId: entity.categoryId,
    pattern: entity.pattern,
    normalizedPattern: entity.normalizedPattern,
    matchType: entity.matchType,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function mapForeignKeyViolation(error: QueryFailedError): Error {
  const driverError = error.driverError as { constraint?: unknown };
  return driverError.constraint === 'fk_category_rules_category_space'
    ? new CategoryNotFoundError()
    : new SpaceNotFoundError();
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_UNIQUE_VIOLATION;
}

function isForeignKeyViolation(error: unknown): error is QueryFailedError {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: unknown };
  return driverError.code === POSTGRES_FOREIGN_KEY_VIOLATION;
}
