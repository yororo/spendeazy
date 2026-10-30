import { UserEntity } from '../../database/entities/user.entity';
import { AccountDeletionError } from '../../users/application/user-errors';
import { UserNotFoundError } from '../../users/application/user-errors';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { TypeOrmStatementImportStore } from './typeorm-statement-import-store';
import {
  TypeOrmImportOperationStore,
  TypeOrmImportRowStore,
} from './typeorm-import-confirmation-store';
import { TypeOrmImportedExpenseStore } from '../../expenses/infrastructure/typeorm-imported-expense-store';
import { TypeOrmExpenseActivityStore } from '../../expenses/infrastructure/typeorm-expense-activity-store';
import { TypeOrmExpenseCategoryStore } from '../../expenses/infrastructure/typeorm-expense-category-store';
import { TypeOrmUserStore } from '../../users/infrastructure/typeorm-user-store';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { StatementImportEntity } from '../../database/entities/statement-import.entity';
import { ExpenseEntity } from '../../database/entities/expense.entity';
import { CategoryRuleEntity } from '../../database/entities/category-rule.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceNotFoundError } from '../../spaces/application/space-errors';
import { CategoryRulePatternConflictError } from '../../category-rules/application/category-rule-errors';
import {
  ruleKey,
  validateRulePattern,
} from '../../category-rules/application/category-rule-validation';
import type {
  ReviewedImportContext,
  ReviewedImportUnitOfWork,
} from '../application/reviewed-import-unit-of-work';
import type { PrivateConfirmationPayload } from '../application/confirmation-payload';
@Injectable()
export class TypeOrmReviewedImportUnitOfWork implements ReviewedImportUnitOfWork {
  constructor(@InjectDataSource() private readonly database: DataSource) {}
  async recover<T>(
    work: (context: ReviewedImportContext) => Promise<T>,
  ): Promise<T | null> {
    try {
      return await this.execute(work);
    } catch (error) {
      // Transaction rejection follows rollback, releasing partially acquired scope locks.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '55P03'
      )
        return null;
      throw error;
    }
  }
  execute<T>(work: (context: ReviewedImportContext) => Promise<T>): Promise<T> {
    return this.database.transaction((manager) =>
      work(createReviewedImportContext(manager)),
    );
  }
}
export function createReviewedImportContext(
  manager: EntityManager,
): ReviewedImportContext {
  const imports = new TypeOrmStatementImportStore(manager);
  return {
    users: new TypeOrmUserStore(manager),
    categories: new TypeOrmExpenseCategoryStore(manager, true),
    statementImports: imports,
    spaces: imports,
    importedExpenses: new TypeOrmImportedExpenseStore(manager),
    expenseActivities: new TypeOrmExpenseActivityStore(manager),
    operations: new TypeOrmImportOperationStore(manager),
    rows: new TypeOrmImportRowStore(manager),
    async lockExecutionScope(userId, spaceId, nonblocking = false) {
      const actorQuery = manager
        .getRepository(UserEntity)
        .createQueryBuilder('actor')
        .where('actor.id = :userId', { userId })
        .setLock('pessimistic_read');
      if (nonblocking) actorQuery.setOnLocked('nowait');
      const actor = await actorQuery.getOne();
      if (!actor) throw new UserNotFoundError();
      if (actor.deletionStatus !== 'active')
        throw new AccountDeletionError(actor.deletionStatus);
      const spaceQuery = manager
        .getRepository(SpaceEntity)
        .createQueryBuilder('space')
        .where('space.id = :spaceId', { spaceId })
        .setLock('pessimistic_write');
      if (nonblocking) spaceQuery.setOnLocked('nowait');
      const space = await spaceQuery.getOne();
      if (!space) throw new SpaceNotFoundError();
    },
    async requireReadAccess(userId, spaceId) {
      const actor = await manager
        .getRepository(UserEntity)
        .createQueryBuilder('actor')
        .where('actor.id = :userId', { userId })
        .setLock('pessimistic_read')
        .getOne();
      if (!actor) throw new UserNotFoundError();
      if (actor.deletionStatus !== 'active')
        throw new AccountDeletionError(actor.deletionStatus);
      if (
        !(await manager
          .getRepository(SpaceMembershipEntity)
          .findOne({ where: { userId, spaceId } }))
      )
        throw new SpaceNotFoundError();
    },
    async findFileMatches(spaceId, fileHash) {
      return (
        await manager
          .getRepository(StatementImportEntity)
          .find({ where: { spaceId, fileHash }, select: { id: true } })
      ).map((row) => row.id);
    },
    async findDuplicateHistory(spaceId, fingerprints, references) {
      if (!fingerprints.length && !references.length) return [];
      // Deliberately includes soft-deleted imported Expenses; browsing predicates stay unchanged.
      const query = manager
        .getRepository(ExpenseEntity)
        .createQueryBuilder('expense')
        .where('expense.spaceId = :spaceId', { spaceId })
        .andWhere('expense.statementImportId IS NOT NULL');
      const predicates: string[] = [];
      if (fingerprints.length)
        predicates.push('expense.importFingerprint IN (:...fingerprints)');
      if (references.length)
        predicates.push('expense.referenceHash IN (:...references)');
      const rows = await query
        .andWhere(`(${predicates.join(' OR ')})`, { fingerprints, references })
        .getMany();
      return rows.map((row) => ({
        id: row.id,
        statementImportId: row.statementImportId!,
        importFingerprint: row.importFingerprint!,
        referenceHash: row.referenceHash,
      }));
    },
    appendRules: (spaceId, rules) => appendRules(manager, spaceId, rules),
    async savepoint(work) {
      await manager.query('SAVEPOINT reviewed_import_writes');
      try {
        const result = await work();
        await manager.query('RELEASE SAVEPOINT reviewed_import_writes');
        return result;
      } catch (error) {
        await manager.query('ROLLBACK TO SAVEPOINT reviewed_import_writes');
        throw error;
      }
    },
  };
}
async function appendRules(
  manager: EntityManager,
  spaceId: string,
  rules: PrivateConfirmationPayload['rememberedRules'],
) {
  const repository = manager.getRepository(CategoryRuleEntity);
  const existing = await repository.find({ where: { spaceId } });
  const byKey = new Map(existing.map((rule) => [ruleKey(rule), rule]));
  const additions: {
    pattern: string;
    normalizedPattern: string;
    matchType: 'exact' | 'contains';
    categoryId: string;
  }[] = [];
  for (const rule of rules) {
    const normalized = {
      ...rule,
      pattern: rule.pattern.trim(),
      normalizedPattern: validateRulePattern(rule.pattern),
    };
    const key = ruleKey(normalized);
    const owner =
      byKey.get(key) ?? additions.find((item) => ruleKey(item) === key);
    if (owner && owner.categoryId !== rule.categoryId)
      throw new CategoryRulePatternConflictError(owner.categoryId);
    if (!owner) additions.push(normalized);
  }
  if (!additions.length) return;
  await repository.save(
    additions.map((rule) => repository.create({ ...rule, spaceId })),
  );
  for (const id of new Set(additions.map((rule) => rule.categoryId))) {
    await manager
      .getRepository(CategoryEntity)
      .increment({ id, spaceId }, 'revision', 1);
  }
  await manager
    .getRepository(SpaceEntity)
    .increment({ id: spaceId }, 'categoryRulesRevision', 1);
}
