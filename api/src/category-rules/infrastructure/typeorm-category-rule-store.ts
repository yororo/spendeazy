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
import { UserEntity } from '../../database/entities/user.entity';
import { StaleEditError } from '../../errors/application-error';
import {
  ruleKey,
  validateReplacementConflicts,
} from '../application/category-rule-validation';
import {
  CategoryRuleOwnerNotFoundError,
  CategoryRulePatternConflictError,
} from '../application/category-rule-errors';
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

  async findById(
    userId: string,
    id: string,
  ): Promise<CategoryRuleRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryRuleEntity)
      .findOne({ where: { id, userId } });

    return entity ? toCategoryRuleRecord(entity) : null;
  }

  async findAll(userId: string): Promise<CategoryRuleRecord[]> {
    const entities = await this.entityManager
      .getRepository(CategoryRuleEntity)
      .find({
        where: { userId },
        order: { id: 'ASC' },
      });

    return entities.map(toCategoryRuleRecord);
  }

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

  async findByNormalizedPattern(
    userId: string,
    normalizedPattern: string,
    excludingId?: string,
    matchType: CategoryRuleMatchType = EXACT_CATEGORY_RULE_MATCH_TYPE,
  ): Promise<CategoryRuleRecord | null> {
    const query = this.entityManager
      .getRepository(CategoryRuleEntity)
      .createQueryBuilder('categoryRule')
      .where('categoryRule.user_id = :userId', { userId })
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

  async create(input: NewCategoryRule): Promise<CategoryRuleRecord> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleOwner(entityManager, input.userId);
      await ensureActiveCategory(entityManager, input.userId, input.categoryId);

      const repository = entityManager.getRepository(CategoryRuleEntity);
      const entity = repository.create({
        userId: input.userId,
        categoryId: input.categoryId,
        pattern: input.pattern,
        normalizedPattern: input.normalizedPattern,
        matchType: input.matchType ?? EXACT_CATEGORY_RULE_MATCH_TYPE,
      });

      await ensurePatternAvailable(repository, entity);
      return saveCategoryRule(repository, entity);
    });
  }

  async createInSpace(input: NewCategoryRule): Promise<CategoryRuleRecord> {
    if (input.spaceId === undefined) {
      throw new Error('Space-scoped Category Rule creation requires a Space.');
    }

    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleSpace(entityManager, input.spaceId!);
      await ensureActiveCategoryInSpace(
        entityManager,
        input.spaceId!,
        input.categoryId,
      );

      const repository = entityManager.getRepository(CategoryRuleEntity);
      const entity = repository.create({
        userId: input.userId,
        spaceId: input.spaceId,
        categoryId: input.categoryId,
        pattern: input.pattern,
        normalizedPattern: input.normalizedPattern,
        matchType: input.matchType ?? EXACT_CATEGORY_RULE_MATCH_TYPE,
      });

      await ensurePatternAvailable(repository, entity, 'space');
      const saved = await saveCategoryRule(repository, entity);
      await bumpRuleRevision(entityManager, input.spaceId!);
      return saved;
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord | null> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleOwner(entityManager, userId);
      const repository = entityManager.getRepository(CategoryRuleEntity);
      const entity = await repository.findOne({ where: { id, userId } });
      if (!entity) {
        return null;
      }
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
        await ensureActiveCategory(entityManager, userId, input.categoryId);
        entity.categoryId = input.categoryId;
      }
      if (input.pattern !== undefined) {
        entity.pattern = input.pattern;
      }
      if (input.normalizedPattern !== undefined) {
        entity.normalizedPattern = input.normalizedPattern;
      }
      if (input.matchType !== undefined) {
        entity.matchType = input.matchType;
      }

      await ensurePatternAvailable(repository, entity);
      return saveCategoryRule(repository, entity);
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

      await ensurePatternAvailable(repository, entity, 'space');
      const saved = await saveCategoryRule(repository, entity);
      await bumpRuleRevision(entityManager, spaceId);
      return saved;
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleOwner(entityManager, userId);
      const result = await entityManager
        .getRepository(CategoryRuleEntity)
        .delete({ id, userId });
      return result.affected === 1;
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

  async replaceForCategory(
    userId: string,
    categoryId: string,
    rules: NormalizedReplacementCategoryRule[],
  ): Promise<CategoryRuleRecord[]> {
    return this.entityManager.transaction(async (entityManager) => {
      await lockRuleOwner(entityManager, userId);
      await ensureActiveCategory(entityManager, userId, categoryId);
      const repository = entityManager.getRepository(CategoryRuleEntity);
      const allRules = await repository.find({
        where: { userId },
        order: { id: 'ASC' },
      });
      validateReplacementConflicts(categoryId, rules, allRules);
      const currentRules = allRules.filter(
        (rule) => rule.categoryId === categoryId,
      );
      const currentByKey = new Map(
        currentRules.map((rule) => [ruleKey(rule), rule]),
      );
      const requestedKeys = new Set(rules.map(ruleKey));
      for (const rule of currentRules) {
        if (!requestedKeys.has(ruleKey(rule))) {
          await repository.delete({ id: rule.id, userId, categoryId });
        }
      }
      for (const rule of rules) {
        const current = currentByKey.get(ruleKey(rule));
        if (current && current.pattern === rule.pattern) continue;
        const entity = current
          ? Object.assign(current, { pattern: rule.pattern })
          : repository.create({ userId, categoryId, ...rule });
        await saveCategoryRule(repository, entity);
      }
      return (
        await repository.find({
          where: { userId, categoryId },
          order: { id: 'ASC' },
        })
      ).map(toCategoryRuleRecord);
    });
  }

  async replaceForCategoryInSpace(
    userId: string,
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
        if (!current) entity.userId = userId;
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

async function lockRuleOwner(
  entityManager: EntityManager,
  userId: string,
): Promise<void> {
  // All rule mutations share this lock, including inserts into an empty rule set.
  const user = await entityManager
    .getRepository(UserEntity)
    .createQueryBuilder('user')
    .where('user.id = :userId', { userId })
    .setLock('pessimistic_write')
    .getOne();
  if (!user) throw new CategoryRuleOwnerNotFoundError();
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
  if (!space) throw new CategoryRuleOwnerNotFoundError();
  return space;
}

async function ensurePatternAvailable(
  repository: Repository<CategoryRuleEntity>,
  entity: CategoryRuleEntity,
  scope: 'user' | 'space' = 'user',
): Promise<void> {
  const existing = await repository.findOne({
    where: {
      ...(scope === 'space'
        ? { spaceId: entity.spaceId }
        : { userId: entity.userId }),
      normalizedPattern: entity.normalizedPattern,
      matchType: entity.matchType,
    },
  });
  if (existing && existing.id !== entity.id)
    throw new CategoryRulePatternConflictError(existing.categoryId);
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
  if (!space) throw new CategoryRuleOwnerNotFoundError();
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
    userId: entity.userId,
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
  return driverError.constraint === 'fk_category_rules_category_user' ||
    driverError.constraint === 'fk_category_rules_category_space'
    ? new CategoryNotFoundError()
    : new CategoryRuleOwnerNotFoundError();
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
