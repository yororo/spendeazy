import { Inject, Injectable } from '@nestjs/common';
import {
  ApplicationError,
  StaleEditError,
} from '../../errors/application-error';
import {
  ruleKey,
  validateReplacementConflicts,
  validateRuleMatchType,
  validateRulePattern,
} from '../../category-rules/application/category-rule-validation';
import type {
  NormalizedReplacementCategoryRule,
  CategoryRuleRecord,
} from '../../category-rules/application/category-rule-store';
import {
  CategoryNameConflictError,
  CategoryNotFoundError,
} from './category-errors';
import {
  CATEGORY_CONFIGURATION_STORE,
  type CategoryConfigurationFields,
  type CategoryConfigurationInput,
  type CategoryConfigurationRecord,
  type CategoryConfigurationStore,
  type CategoryConfigurationTransaction,
  type NormalizedCategoryConfigurationInput,
} from './category-configuration-store';
import {
  normalizeCategoryDisplayName,
  normalizeCategoryName,
} from './categories.service';

@Injectable()
export class CategoryConfigurationsService {
  constructor(
    @Inject(CATEGORY_CONFIGURATION_STORE)
    private readonly configurationStore: CategoryConfigurationStore,
  ) {}

  async getInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<CategoryConfigurationRecord> {
    const configuration = await this.configurationStore.findInSpace(
      spaceId,
      categoryId,
    );
    if (!configuration) throw new CategoryNotFoundError();
    return configuration;
  }

  async createInSpace(
    spaceId: string,
    input: CategoryConfigurationInput,
  ): Promise<CategoryConfigurationRecord> {
    const draft = normalizeInput(input);
    if (input.expectedRevision !== null)
      throw staleRevision('/expectedRevision');

    return this.configurationStore.inWritableSpace(
      spaceId,
      async (transaction) => {
        await ensureNameAvailable(transaction, draft.name);
        const allRules = await transaction.findAllRules();
        const changedRules = draft.rules.length > 0;
        if (changedRules)
          assertRulesRevision(transaction, input.expectedRulesRevision);
        validateReplacementConflicts('', draft.rules, allRules);

        const category = await transaction.createCategory(spaceId, draft);
        if (draft.budget !== null) {
          await transaction.replaceBudget(category.id, draft.budget);
        }
        let rulesRevision = transaction.rulesRevision;
        if (changedRules) {
          await transaction.replaceRules(category.id, draft.rules);
          rulesRevision = await transaction.bumpRulesRevision();
        }

        return readConfiguration(
          transaction,
          category.id,
          category,
          rulesRevision,
        );
      },
    );
  }

  async replaceInSpace(
    spaceId: string,
    categoryId: string,
    input: CategoryConfigurationInput,
  ): Promise<CategoryConfigurationRecord> {
    const expectedRevision = input.expectedRevision;
    if (expectedRevision === null) {
      throw staleRevision('/expectedRevision');
    }
    const draft = normalizeInput(input);

    return this.configurationStore.inWritableSpace(
      spaceId,
      async (transaction) => {
        const currentCategory = await transaction.findCategory(categoryId);
        if (!currentCategory) throw new CategoryNotFoundError();
        assertCategoryRevision(currentCategory.revision, expectedRevision);

        await ensureNameAvailable(transaction, draft.name, categoryId);
        const [currentBudget, allRules] = await Promise.all([
          transaction.findBudget(categoryId),
          transaction.findAllRules(),
        ]);
        const currentRules = allRules.filter(
          (rule) => rule.categoryId === categoryId,
        );
        const rulesChanged = !sameRuleSet(currentRules, draft.rules);
        if (rulesChanged)
          assertRulesRevision(transaction, input.expectedRulesRevision);
        validateReplacementConflicts(categoryId, draft.rules, allRules);

        const categoryChanged = !sameCategoryFields(currentCategory, draft);
        const budgetChanged = !sameBudget(currentBudget, draft.budget);
        if (!categoryChanged && !budgetChanged && !rulesChanged) {
          return {
            category: currentCategory,
            budget: currentBudget,
            rules: currentRules,
            rulesRevision: transaction.rulesRevision,
          };
        }

        const category = await transaction.updateCategory(categoryId, draft);
        if (!category) throw new CategoryNotFoundError();
        if (budgetChanged) {
          await transaction.replaceBudget(categoryId, draft.budget);
        }
        let rulesRevision = transaction.rulesRevision;
        if (rulesChanged) {
          await transaction.replaceRules(categoryId, draft.rules);
          rulesRevision = await transaction.bumpRulesRevision();
        }

        return {
          category,
          budget: budgetChanged
            ? await transaction.findBudget(categoryId)
            : currentBudget,
          rules: rulesChanged
            ? (await transaction.findAllRules()).filter(
                (rule) => rule.categoryId === categoryId,
              )
            : currentRules,
          rulesRevision,
        };
      },
    );
  }
}

function normalizeInput(
  input: CategoryConfigurationInput,
): NormalizedCategoryConfigurationInput {
  const name = normalizeCategoryDisplayName(input.name);
  if (name.length === 0) {
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'The request contains invalid fields.',
      [
        {
          field: '/name',
          code: 'invalid_value',
          message: 'Category name is required.',
        },
      ],
    );
  }
  return {
    name,
    iconKey: input.iconKey,
    color: input.color,
    isActive: input.isActive,
    budget: input.budget,
    rules: input.rules.map((rule, index) => {
      validateRuleMatchType(rule.matchType, `/rules/${index}/matchType`);
      return {
        ...rule,
        normalizedPattern: validateRulePattern(
          rule.pattern,
          `/rules/${index}/pattern`,
        ),
      };
    }),
  };
}

async function ensureNameAvailable(
  transaction: CategoryConfigurationTransaction,
  name: string,
  categoryId?: string,
): Promise<void> {
  const existing = await transaction.findCategoryByNormalizedName(
    normalizeCategoryName(name),
  );
  if (existing && existing.id !== categoryId) {
    throw new CategoryNameConflictError();
  }
}

function assertCategoryRevision(current: string, expected: string): void {
  if (current !== expected) throw new StaleEditError();
}

function assertRulesRevision(
  transaction: CategoryConfigurationTransaction,
  expected: string,
): void {
  if (transaction.rulesRevision !== expected) {
    throw staleRevision('/expectedRulesRevision');
  }
}

function staleRevision(field: string): ApplicationError {
  return new ApplicationError(
    'STALE_EDIT',
    'This configuration changed elsewhere. Reload and review your edits before saving.',
    [
      {
        field,
        code: 'incompatible',
        message:
          'This configuration changed elsewhere. Reload and review your edits before saving.',
      },
    ],
  );
}

function sameCategoryFields(
  current: CategoryConfigurationRecord['category'],
  draft: CategoryConfigurationFields,
): boolean {
  return (
    current.name === draft.name &&
    current.iconKey === draft.iconKey &&
    current.color === draft.color &&
    current.isActive === draft.isActive
  );
}

function sameBudget(
  current: CategoryConfigurationRecord['budget'],
  draft: NormalizedCategoryConfigurationInput['budget'],
): boolean {
  if (current === null || draft === null) return current === draft;
  return current.amount === draft.amount && current.period === draft.recurrence;
}

function sameRuleSet(
  current: CategoryRuleRecord[],
  draft: NormalizedReplacementCategoryRule[],
): boolean {
  if (current.length !== draft.length) return false;
  const currentKeys = new Set(current.map(ruleKey));
  return draft.every((rule) => currentKeys.has(ruleKey(rule)));
}

async function readConfiguration(
  transaction: CategoryConfigurationTransaction,
  categoryId: string,
  category: CategoryConfigurationRecord['category'],
  rulesRevision: string,
): Promise<CategoryConfigurationRecord> {
  const [budget, allRules] = await Promise.all([
    transaction.findBudget(categoryId),
    transaction.findAllRules(),
  ]);
  return {
    category,
    budget,
    rules: allRules.filter((rule) => rule.categoryId === categoryId),
    rulesRevision,
  };
}
