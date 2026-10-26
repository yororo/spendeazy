import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { CategoryRulePatternConflictError } from '../../category-rules/application/category-rule-errors';
import {
  type CategoryRuleRecord,
  type NormalizedReplacementCategoryRule,
} from '../../category-rules/application/category-rule-store';
import { ruleKey } from '../../category-rules/application/category-rule-validation';
import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../database/database-error-codes';
import { BudgetEntity } from '../../database/entities/budget.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { CategoryRuleEntity } from '../../database/entities/category-rule.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { CategoryNameConflictError } from '../application/category-errors';
import type {
  CategoryConfigurationBudget,
  CategoryConfigurationFields,
  CategoryConfigurationRecord,
  CategoryConfigurationStore,
  CategoryConfigurationTransaction,
} from '../application/category-configuration-store';
import type { BudgetRecord } from '../application/budget-store';
import type { CategoryRecord } from '../application/category-store';
import { SpaceNotFoundError } from '../../spaces/application/space-errors';
import { lockWritableSpace } from '../../spaces/infrastructure/space-write-guard';
import { CATEGORY_REVISION_INCREMENT } from './typeorm-category-revision';

@Injectable()
export class TypeOrmCategoryConfigurationStore implements CategoryConfigurationStore {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async findInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<CategoryConfigurationRecord | null> {
    return this.entityManager.transaction(async (manager) => {
      const space = await lockSpaceForConfigurationRead(manager, spaceId);
      const categoryEntity = await manager
        .getRepository(CategoryEntity)
        .findOne({ where: { id: categoryId, spaceId } });
      if (!categoryEntity) return null;

      const [budgetEntity, ruleEntities] = await Promise.all([
        manager.getRepository(BudgetEntity).findOne({ where: { categoryId } }),
        manager.getRepository(CategoryRuleEntity).find({
          where: { spaceId, categoryId },
          order: { id: 'ASC' },
        }),
      ]);

      return {
        category: toCategoryRecord(categoryEntity),
        budget: budgetEntity ? toBudgetRecord(budgetEntity) : null,
        rules: ruleEntities.map(toCategoryRuleRecord),
        rulesRevision: space.categoryRulesRevision,
      };
    });
  }

  async inWritableSpace<T>(
    spaceId: string,
    work: (transaction: CategoryConfigurationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.entityManager.transaction(async (manager) => {
      const space = await lockWritableSpace(manager, spaceId);
      return work(new TypeOrmCategoryConfigurationTransaction(manager, space));
    });
  }
}

class TypeOrmCategoryConfigurationTransaction implements CategoryConfigurationTransaction {
  readonly rulesRevision: string;

  constructor(
    private readonly manager: EntityManager,
    space: SpaceEntity,
  ) {
    this.rulesRevision = space.categoryRulesRevision;
    this.spaceId = space.id;
  }

  private readonly spaceId: string;

  async findCategory(categoryId: string): Promise<CategoryRecord | null> {
    const entity = await this.manager
      .getRepository(CategoryEntity)
      .findOne({ where: { id: categoryId, spaceId: this.spaceId } });
    return entity ? toCategoryRecord(entity) : null;
  }

  async findCategoryByNormalizedName(
    name: string,
  ): Promise<CategoryRecord | null> {
    const entity = await this.manager
      .getRepository(CategoryEntity)
      .createQueryBuilder('category')
      .where('category.space_id = :spaceId', { spaceId: this.spaceId })
      .andWhere('LOWER(BTRIM(category.name)) = :name', { name })
      .getOne();
    return entity ? toCategoryRecord(entity) : null;
  }

  async findBudget(categoryId: string): Promise<BudgetRecord | null> {
    const entity = await this.manager
      .getRepository(BudgetEntity)
      .findOne({ where: { categoryId } });
    return entity ? toBudgetRecord(entity) : null;
  }

  async findAllRules(): Promise<CategoryRuleRecord[]> {
    const entities = await this.manager.getRepository(CategoryRuleEntity).find({
      where: { spaceId: this.spaceId },
      order: { id: 'ASC' },
    });
    return entities.map(toCategoryRuleRecord);
  }

  async createCategory(
    spaceId: string,
    fields: CategoryConfigurationFields,
  ): Promise<CategoryRecord> {
    const repository = this.manager.getRepository(CategoryEntity);
    const entity = repository.create({
      spaceId,
      name: fields.name,
      description: null,
      iconKey: fields.iconKey,
      color: fields.color,
      isActive: fields.isActive,
    });
    try {
      return toCategoryRecord(await repository.save(entity));
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new CategoryNameConflictError();
      if (isForeignKeyViolation(error)) throw new SpaceNotFoundError();
      throw error;
    }
  }

  async updateCategory(
    categoryId: string,
    fields: CategoryConfigurationFields,
  ): Promise<CategoryRecord | null> {
    const repository = this.manager.getRepository(CategoryEntity);
    try {
      const result = await repository
        .createQueryBuilder()
        .update(CategoryEntity)
        .set({
          name: fields.name,
          iconKey: fields.iconKey,
          color: fields.color,
          isActive: fields.isActive,
          revision: CATEGORY_REVISION_INCREMENT,
        })
        .where('id = :categoryId', { categoryId })
        .andWhere('space_id = :spaceId', { spaceId: this.spaceId })
        .execute();
      if (result.affected !== 1) return null;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new CategoryNameConflictError();
      throw error;
    }
    const updated = await repository.findOne({
      where: { id: categoryId, spaceId: this.spaceId },
    });
    return updated ? toCategoryRecord(updated) : null;
  }

  async replaceBudget(
    categoryId: string,
    budget: CategoryConfigurationBudget | null,
  ): Promise<void> {
    const repository = this.manager.getRepository(BudgetEntity);
    const current = await repository.findOne({ where: { categoryId } });
    if (budget === null) {
      if (current) await repository.delete({ categoryId });
      return;
    }

    if (current) {
      current.amount = budget.amount;
      current.period = budget.recurrence;
      await repository.save(current);
      return;
    }

    await repository.save(
      repository.create({
        categoryId,
        amount: budget.amount,
        period: budget.recurrence,
      }),
    );
  }

  async replaceRules(
    categoryId: string,
    rules: NormalizedReplacementCategoryRule[],
  ): Promise<void> {
    const repository = this.manager.getRepository(CategoryRuleEntity);
    const currentRules = await repository.find({
      where: { spaceId: this.spaceId, categoryId },
      order: { id: 'ASC' },
    });
    const currentByKey = new Map(
      currentRules.map((rule) => [ruleKey(rule), rule]),
    );
    const requestedKeys = new Set(rules.map(ruleKey));

    for (const rule of currentRules) {
      if (!requestedKeys.has(ruleKey(rule))) {
        await repository.delete({ id: rule.id, spaceId: this.spaceId });
      }
    }
    for (const rule of rules) {
      if (currentByKey.has(ruleKey(rule))) continue;
      const entity = repository.create({
        spaceId: this.spaceId,
        categoryId,
        ...rule,
      });
      await saveCategoryRule(repository, entity);
    }
  }

  async bumpRulesRevision(): Promise<string> {
    const repository = this.manager.getRepository(SpaceEntity);
    await repository
      .createQueryBuilder()
      .update(SpaceEntity)
      .set({ categoryRulesRevision: () => 'category_rules_revision + 1' })
      .where('id = :spaceId', { spaceId: this.spaceId })
      .execute();
    const space = await repository.findOne({ where: { id: this.spaceId } });
    if (!space) throw new SpaceNotFoundError();
    return space.categoryRulesRevision;
  }
}

async function lockSpaceForConfigurationRead(
  manager: EntityManager,
  spaceId: string,
): Promise<SpaceEntity> {
  const space = await manager
    .getRepository(SpaceEntity)
    .createQueryBuilder('space')
    .where('space.id = :spaceId', { spaceId })
    .setLock('pessimistic_write')
    .getOne();
  if (!space) throw new SpaceNotFoundError();
  return space;
}

async function saveCategoryRule(
  repository: Repository<CategoryRuleEntity>,
  entity: CategoryRuleEntity,
): Promise<void> {
  try {
    await repository.save(entity);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new CategoryRulePatternConflictError(entity.categoryId);
    }
    throw error;
  }
}

function toCategoryRecord(entity: CategoryEntity): CategoryRecord {
  return {
    id: entity.id,
    spaceId: entity.spaceId,
    name: entity.name,
    description: entity.description,
    color: entity.color,
    iconKey: entity.iconKey,
    isActive: entity.isActive,
    revision: entity.revision,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toBudgetRecord(entity: BudgetEntity): BudgetRecord {
  return {
    id: entity.id,
    categoryId: entity.categoryId,
    amount: entity.amount,
    period: entity.period,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
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

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  return (
    (error.driverError as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  return (
    (error.driverError as { code?: unknown }).code ===
    POSTGRES_FOREIGN_KEY_VIOLATION
  );
}
