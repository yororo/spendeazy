import type {
  CategoryRuleCategoryRecord,
  CategoryRuleCategoryStore,
} from './category-rule-category-store';
import type {
  CategoryRuleRecord,
  CategoryRuleStore,
  NewCategoryRule,
  UpdateCategoryRule,
  CategoryRuleMatchType,
} from './category-rule-store';
import { CategoryRulesService } from './category-rules.service';
import { StaleEditError } from '../../errors/application-error';

describe('CategoryRulesService', () => {
  it('uses the requested Space for shared rule reads, creates, and replacements', async () => {
    const ruleStore = new CategoryRuleStoreFake([
      ruleRecord({
        id: '1',
        userId: '1',
        spaceId: '10',
        categoryId: '100',
      }),
      ruleRecord({
        id: '2',
        userId: '99',
        spaceId: '99',
        categoryId: '900',
        normalizedPattern: 'shared elsewhere',
      }),
    ]);
    const categoryStore = new CategoryRuleCategoryStoreFake([
      categoryRecord({ id: '100', userId: '1', spaceId: '10' }),
      categoryRecord({ id: '101', userId: '2', spaceId: '10' }),
    ]);
    const service = new CategoryRulesService(ruleStore, categoryStore);

    await expect(service.listCategoryRulesInSpace('10')).resolves.toEqual({
      rules: [ruleStore.rules[0]],
      revision: '4',
    });
    await expect(
      service.createCategoryRuleInSpace('10', {
        categoryId: '101',
        pattern: 'Shared Elsewhere',
      }),
    ).resolves.toMatchObject({
      spaceId: '10',
      categoryId: '101',
      normalizedPattern: 'shared elsewhere',
    });
    expect(ruleStore.createdInSpaceInput).toMatchObject({
      spaceId: '10',
      categoryId: '101',
    });

    await service.replaceCategoryRulesInSpace(
      '10',
      '101',
      [{ pattern: 'Utilities', matchType: 'contains' }],
      '4',
    );
    expect(ruleStore.replaceForCategoryInSpace).toHaveBeenCalledWith(
      '10',
      '101',
      [
        {
          pattern: 'Utilities',
          normalizedPattern: 'utilities',
          matchType: 'contains',
        },
      ],
      '4',
    );
    expect(ruleStore.findByNormalizedPatternInSpace).toHaveBeenCalledWith(
      '10',
      'shared elsewhere',
      undefined,
      'exact',
    );
  });

  it('rejects a stale scoped individual edit before the store writes', async () => {
    const current = ruleRecord({
      spaceId: '10',
      updatedAt: new Date('2026-08-29T00:00:01.000Z'),
    });
    const ruleStore = new CategoryRuleStoreFake([current]);
    const service = new CategoryRulesService(
      ruleStore,
      new CategoryRuleCategoryStoreFake([
        categoryRecord({ id: '10', spaceId: '10' }),
      ]),
    );

    await expect(
      service.updateCategoryRuleInSpace('10', current.id, {
        pattern: 'New pattern',
        expectedUpdatedAt: '2026-08-29T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect(ruleStore.updatedInSpaceInput).toBeUndefined();
  });
});

class CategoryRuleStoreFake implements CategoryRuleStore {
  replaceForCategory = jest.fn().mockResolvedValue([]);
  replaceForCategoryInSpace = jest.fn().mockResolvedValue({
    rules: [],
    revision: '4',
  });
  createdInput: NewCategoryRule | undefined;
  createdRule: CategoryRuleRecord | undefined;
  createdInSpaceInput: NewCategoryRule | undefined;
  updatedInput: UpdateCategoryRule | undefined;
  updatedInSpaceInput: UpdateCategoryRule | undefined;

  constructor(public readonly rules: CategoryRuleRecord[] = []) {}

  findById(userId: string, id: string): Promise<CategoryRuleRecord | null> {
    return Promise.resolve(
      this.rules.find((rule) => rule.userId === userId && rule.id === id) ??
        null,
    );
  }

  findAll(userId: string): Promise<CategoryRuleRecord[]> {
    return Promise.resolve(this.rules.filter((rule) => rule.userId === userId));
  }

  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleRecord | null> {
    return Promise.resolve(
      this.rules.find((rule) => rule.spaceId === spaceId && rule.id === id) ??
        null,
    );
  }

  findAllInSpace(spaceId: string) {
    return Promise.resolve({
      rules: this.rules.filter((rule) => rule.spaceId === spaceId),
      revision: '4',
    });
  }

  findByNormalizedPattern(
    userId: string,
    normalizedPattern: string,
    excludingId?: string,
    matchType: CategoryRuleMatchType = 'exact',
  ): Promise<CategoryRuleRecord | null> {
    return Promise.resolve(
      this.rules.find(
        (rule) =>
          rule.userId === userId &&
          rule.id !== excludingId &&
          rule.matchType === matchType &&
          rule.normalizedPattern === normalizedPattern,
      ) ?? null,
    );
  }

  findByNormalizedPatternInSpace = jest.fn(
    (
      spaceId: string,
      normalizedPattern: string,
      excludingId?: string,
      matchType: CategoryRuleMatchType = 'exact',
    ) =>
      Promise.resolve(
        this.rules.find(
          (rule) =>
            rule.spaceId === spaceId &&
            rule.id !== excludingId &&
            rule.matchType === matchType &&
            rule.normalizedPattern === normalizedPattern,
        ) ?? null,
      ),
  );

  create(input: NewCategoryRule): Promise<CategoryRuleRecord> {
    this.createdInput = input;
    this.createdRule = ruleRecord({ ...input, id: '2' });
    this.rules.push(this.createdRule);
    return Promise.resolve(this.createdRule);
  }

  createInSpace(input: NewCategoryRule): Promise<CategoryRuleRecord> {
    this.createdInSpaceInput = input;
    const created = ruleRecord({ ...input, id: '3' });
    this.rules.push(created);
    return Promise.resolve(created);
  }

  update(
    userId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord | null> {
    this.updatedInput = input;
    const rule = this.rules.find(
      (candidate) => candidate.userId === userId && candidate.id === id,
    );
    if (!rule) {
      return Promise.resolve(null);
    }

    Object.assign(rule, input, { updatedAt: new Date() });
    return Promise.resolve(rule);
  }

  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateCategoryRule,
  ): Promise<CategoryRuleRecord | null> {
    this.updatedInSpaceInput = input;
    const rule = this.rules.find(
      (candidate) => candidate.spaceId === spaceId && candidate.id === id,
    );
    if (!rule) return Promise.resolve(null);

    Object.assign(rule, input, { updatedAt: new Date() });
    return Promise.resolve(rule);
  }

  delete(userId: string, id: string): Promise<boolean> {
    const index = this.rules.findIndex(
      (rule) => rule.userId === userId && rule.id === id,
    );
    if (index === -1) {
      return Promise.resolve(false);
    }

    this.rules.splice(index, 1);
    return Promise.resolve(true);
  }

  deleteInSpace(spaceId: string, id: string): Promise<boolean> {
    const index = this.rules.findIndex(
      (rule) => rule.spaceId === spaceId && rule.id === id,
    );
    if (index === -1) return Promise.resolve(false);
    this.rules.splice(index, 1);
    return Promise.resolve(true);
  }
}

class CategoryRuleCategoryStoreFake implements CategoryRuleCategoryStore {
  constructor(private readonly categories: CategoryRuleCategoryRecord[] = []) {}

  findById(
    userId: string,
    id: string,
  ): Promise<CategoryRuleCategoryRecord | null> {
    return Promise.resolve(
      this.categories.find(
        (category) => category.userId === userId && category.id === id,
      ) ?? null,
    );
  }

  findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleCategoryRecord | null> {
    return Promise.resolve(
      this.categories.find(
        (category) => category.spaceId === spaceId && category.id === id,
      ) ?? null,
    );
  }
}

function ruleRecord(
  overrides: Partial<CategoryRuleRecord> = {},
): CategoryRuleRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    userId: '1',
    spaceId: '10',
    categoryId: '10',
    pattern: 'Groceries',
    normalizedPattern: 'groceries',
    matchType: 'exact',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function categoryRecord(
  overrides: Partial<CategoryRuleCategoryRecord> = {},
): CategoryRuleCategoryRecord {
  return {
    id: '10',
    userId: '1',
    spaceId: '10',
    isActive: true,
    ...overrides,
  };
}
