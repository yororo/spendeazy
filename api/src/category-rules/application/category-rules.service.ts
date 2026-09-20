import { Inject, Injectable } from '@nestjs/common';
import { StaleEditError } from '../../errors/application-error';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { normalizeMatchingText } from '../../normalization/matching-text';
import {
  validateRulePattern,
  validateRuleMatchType,
  validateReplacementConflicts,
} from './category-rule-validation';
import {
  CATEGORY_RULE_CATEGORY_STORE,
  type CategoryRuleCategoryStore,
} from './category-rule-category-store';
import {
  CategoryRuleNotFoundError,
  CategoryRulePatternConflictError,
} from './category-rule-errors';
import {
  CATEGORY_RULE_STORE,
  type CategoryRuleRecord,
  type CategoryRuleCollectionRecord,
  type CategoryRuleStore,
  type NewCategoryRule,
  type UpdateCategoryRule,
  type CategoryRuleMatchType,
  type ReplacementCategoryRule,
} from './category-rule-store';

@Injectable()
export class CategoryRulesService {
  constructor(
    @Inject(CATEGORY_RULE_STORE)
    private readonly categoryRuleStore: CategoryRuleStore,
    @Inject(CATEGORY_RULE_CATEGORY_STORE)
    private readonly categoryStore: CategoryRuleCategoryStore,
  ) {}

  async createCategoryRule(
    userId: string,
    input: Omit<NewCategoryRule, 'userId' | 'normalizedPattern'>,
  ): Promise<CategoryRuleRecord> {
    await this.ensureActiveCategory(userId, input.categoryId);

    const normalizedPattern = validateRulePattern(input.pattern);
    const matchType = input.matchType === undefined ? 'exact' : input.matchType;
    validateRuleMatchType(matchType);
    await this.ensurePatternAvailable(
      userId,
      normalizedPattern,
      undefined,
      matchType,
    );

    return this.categoryRuleStore.create({
      userId,
      categoryId: input.categoryId,
      pattern: input.pattern,
      normalizedPattern,
      matchType,
    });
  }

  async createCategoryRuleInSpace(
    userId: string,
    spaceId: string,
    input: Omit<NewCategoryRule, 'userId' | 'spaceId' | 'normalizedPattern'>,
  ): Promise<CategoryRuleRecord> {
    await this.ensureActiveCategoryInSpace(spaceId, input.categoryId);

    const normalizedPattern = validateRulePattern(input.pattern);
    const matchType = input.matchType === undefined ? 'exact' : input.matchType;
    validateRuleMatchType(matchType);
    await this.ensurePatternAvailableInSpace(
      spaceId,
      normalizedPattern,
      undefined,
      matchType,
    );

    return this.categoryRuleStore.createInSpace({
      userId,
      spaceId,
      categoryId: input.categoryId,
      pattern: input.pattern,
      normalizedPattern,
      matchType,
    });
  }

  listCategoryRules(userId: string): Promise<CategoryRuleRecord[]> {
    return this.categoryRuleStore.findAll(userId);
  }

  listCategoryRulesInSpace(
    spaceId: string,
  ): Promise<CategoryRuleCollectionRecord> {
    return this.categoryRuleStore.findAllInSpace(spaceId);
  }

  async replaceCategoryRules(
    userId: string,
    categoryId: string,
    rules: ReplacementCategoryRule[],
  ): Promise<CategoryRuleRecord[]> {
    await this.ensureActiveCategory(userId, categoryId);
    const normalizedRules = rules.map((rule, index) => {
      validateRuleMatchType(rule.matchType, `/rules/${index}/matchType`);
      return {
        ...rule,
        normalizedPattern: validateRulePattern(
          rule.pattern,
          `/rules/${index}/pattern`,
        ),
      };
    });
    validateReplacementConflicts(categoryId, normalizedRules, []);

    return this.categoryRuleStore.replaceForCategory(
      userId,
      categoryId,
      normalizedRules,
    );
  }

  async replaceCategoryRulesInSpace(
    userId: string,
    spaceId: string,
    categoryId: string,
    rules: ReplacementCategoryRule[],
    expectedRevision?: string,
  ): Promise<CategoryRuleCollectionRecord> {
    await this.ensureActiveCategoryInSpace(spaceId, categoryId);
    const normalizedRules = rules.map((rule, index) => {
      validateRuleMatchType(rule.matchType, `/rules/${index}/matchType`);
      return {
        ...rule,
        normalizedPattern: validateRulePattern(
          rule.pattern,
          `/rules/${index}/pattern`,
        ),
      };
    });
    validateReplacementConflicts(categoryId, normalizedRules, []);

    return this.categoryRuleStore.replaceForCategoryInSpace(
      userId,
      spaceId,
      categoryId,
      normalizedRules,
      expectedRevision,
    );
  }

  async getCategoryRule(
    userId: string,
    id: string,
  ): Promise<CategoryRuleRecord> {
    const rule = await this.categoryRuleStore.findById(userId, id);
    if (!rule) {
      throw new CategoryRuleNotFoundError();
    }

    return rule;
  }

  async getCategoryRuleInSpace(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleRecord> {
    const rule = await this.categoryRuleStore.findByIdInSpace(spaceId, id);
    if (!rule) {
      throw new CategoryRuleNotFoundError();
    }

    return rule;
  }

  async updateCategoryRule(
    userId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord> {
    const currentRule = await this.getCategoryRule(userId, id);
    const changes = normalizeUpdate(input);

    if (
      changes.categoryId !== undefined &&
      changes.categoryId !== currentRule.categoryId
    ) {
      await this.ensureActiveCategory(userId, changes.categoryId);
    }

    if (changes.pattern !== undefined) {
      const normalizedPattern = validateRulePattern(changes.pattern);
      changes.normalizedPattern = normalizedPattern;
    }

    if (changes.matchType !== undefined) {
      validateRuleMatchType(changes.matchType);
    }
    await this.ensurePatternAvailable(
      userId,
      changes.normalizedPattern ?? currentRule.normalizedPattern,
      id,
      changes.matchType ?? currentRule.matchType,
    );

    const updatedRule = await this.categoryRuleStore.update(
      userId,
      id,
      changes,
    );
    if (!updatedRule) {
      throw new CategoryRuleNotFoundError();
    }

    return updatedRule;
  }

  async updateCategoryRuleInSpace(
    spaceId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord> {
    const currentRule = await this.getCategoryRuleInSpace(spaceId, id);
    const changes = normalizeUpdate(input);
    assertCurrentVersion(currentRule.updatedAt, changes.expectedUpdatedAt);

    if (
      changes.categoryId !== undefined &&
      changes.categoryId !== currentRule.categoryId
    ) {
      await this.ensureActiveCategoryInSpace(spaceId, changes.categoryId);
    }

    if (changes.pattern !== undefined) {
      const normalizedPattern = validateRulePattern(changes.pattern);
      changes.normalizedPattern = normalizedPattern;
    }

    if (changes.matchType !== undefined) {
      validateRuleMatchType(changes.matchType);
    }
    await this.ensurePatternAvailableInSpace(
      spaceId,
      changes.normalizedPattern ?? currentRule.normalizedPattern,
      id,
      changes.matchType ?? currentRule.matchType,
    );

    const updatedRule = await this.categoryRuleStore.updateInSpace(
      spaceId,
      id,
      changes,
    );
    if (!updatedRule) {
      throw new CategoryRuleNotFoundError();
    }

    return updatedRule;
  }

  async deleteCategoryRule(userId: string, id: string): Promise<void> {
    const deleted = await this.categoryRuleStore.delete(userId, id);
    if (!deleted) {
      throw new CategoryRuleNotFoundError();
    }
  }

  async deleteCategoryRuleInSpace(
    spaceId: string,
    id: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const currentRule = await this.getCategoryRuleInSpace(spaceId, id);
    assertCurrentVersion(currentRule.updatedAt, expectedUpdatedAt);
    const deleted = await this.categoryRuleStore.deleteInSpace(
      spaceId,
      id,
      expectedUpdatedAt,
    );
    if (!deleted) {
      throw new CategoryRuleNotFoundError();
    }
  }

  private async ensureActiveCategory(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categoryStore.findById(userId, categoryId);
    if (!category) {
      throw new CategoryNotFoundError();
    }
    if (!category.isActive) {
      throw new CategoryInactiveError();
    }
  }

  private async ensureActiveCategoryInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categoryStore.findBySpaceId(
      spaceId,
      categoryId,
    );
    if (!category) {
      throw new CategoryNotFoundError();
    }
    if (!category.isActive) {
      throw new CategoryInactiveError();
    }
  }

  private async ensurePatternAvailable(
    userId: string,
    normalizedPattern: string,
    excludingId?: string,
    matchType: CategoryRuleMatchType = 'exact',
  ): Promise<void> {
    const existingRule = await this.categoryRuleStore.findByNormalizedPattern(
      userId,
      normalizedPattern,
      excludingId,
      matchType,
    );
    if (existingRule) {
      throw new CategoryRulePatternConflictError(existingRule.categoryId);
    }
  }

  private async ensurePatternAvailableInSpace(
    spaceId: string,
    normalizedPattern: string,
    excludingId?: string,
    matchType: CategoryRuleMatchType = 'exact',
  ): Promise<void> {
    const existingRule =
      await this.categoryRuleStore.findByNormalizedPatternInSpace(
        spaceId,
        normalizedPattern,
        excludingId,
        matchType,
      );
    if (existingRule) {
      throw new CategoryRulePatternConflictError(existingRule.categoryId);
    }
  }
}

export function normalizeCategoryRulePattern(pattern: string): string {
  return normalizeMatchingText(pattern);
}

function normalizeUpdate(input: UpdateCategoryRule): UpdateCategoryRule {
  return {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.pattern !== undefined ? { pattern: input.pattern } : {}),
    ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
    ...(input.expectedUpdatedAt === undefined
      ? {}
      : { expectedUpdatedAt: input.expectedUpdatedAt }),
  };
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
