import type {
  CategoryRuleCategoryRecord,
  CategoryRuleCategoryStore,
} from './category-rule-category-store';
import {
  CategoryRuleNotFoundError,
  CategoryRulePatternConflictError,
} from './category-rule-errors';
import type {
  CategoryRuleRecord,
  CategoryRuleStore,
  NewCategoryRule,
  UpdateCategoryRule,
  CategoryRuleMatchType,
} from './category-rule-store';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from '../../categories/application/category-errors';
import { CategoryRulesService } from './category-rules.service';
import { StaleEditError } from '../../errors/application-error';

describe('CategoryRulesService', () => {
  it('allows the same pattern with different types and preserves an omitted update type', async () => {
    const rules = new CategoryRuleStoreFake([ruleRecord()]);
    const service = new CategoryRulesService(
      rules,
      new CategoryRuleCategoryStoreFake([categoryRecord()]),
    );
    const created = await service.createCategoryRule('1', {
      categoryId: '10',
      pattern: 'Groceries',
      matchType: 'contains',
    });
    expect(created.matchType).toBe('contains');
    expect(
      (
        await service.updateCategoryRule('1', created.id, {
          pattern: 'GROCERIES',
        })
      ).matchType,
    ).toBe('contains');
    await expect(
      service.updateCategoryRule('1', created.id, { matchType: 'exact' }),
    ).rejects.toMatchObject({
      details: [
        expect.objectContaining({ categoryId: '10', field: '/pattern' }),
      ],
    });
  });

  it('validates every replacement item before calling the atomic store operation', async () => {
    const rules = new CategoryRuleStoreFake();
    const service = new CategoryRulesService(
      rules,
      new CategoryRuleCategoryStoreFake([categoryRecord()]),
    );
    await expect(
      service.replaceCategoryRules('1', '10', [
        { pattern: 'RENT', matchType: 'exact' },
        { pattern: ' rent ', matchType: 'exact' },
      ]),
    ).rejects.toMatchObject({
      details: [
        expect.objectContaining({
          categoryId: '10',
          field: '/rules/1/pattern',
        }),
      ],
    });
    await expect(
      service.replaceCategoryRules('1', '10', [
        { pattern: ' ', matchType: 'contains' },
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(rules.replaceForCategory).not.toHaveBeenCalled();
    await service.replaceCategoryRules('1', '10', [
      { pattern: ' RENT ', matchType: 'contains' },
    ]);
    expect(rules.replaceForCategory).toHaveBeenCalledWith('1', '10', [
      { pattern: ' RENT ', normalizedPattern: 'rent', matchType: 'contains' },
    ]);
  });

  it('rejects empty replacement for an inactive or unowned Category', async () => {
    const rules = new CategoryRuleStoreFake();
    const service = new CategoryRulesService(
      rules,
      new CategoryRuleCategoryStoreFake([categoryRecord({ isActive: false })]),
    );
    await expect(
      service.replaceCategoryRules('1', '10', []),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    await expect(
      service.replaceCategoryRules('2', '10', []),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    expect(rules.replaceForCategory).not.toHaveBeenCalled();
  });
  it('creates an exact rule with a preserved display pattern and normalized value', async () => {
    const ruleStore = new CategoryRuleStoreFake();
    const categoryStore = new CategoryRuleCategoryStoreFake([
      categoryRecord({ id: '10', userId: '1', isActive: true }),
    ]);
    const service = new CategoryRulesService(ruleStore, categoryStore);

    const createdRule = await service.createCategoryRule('1', {
      categoryId: '10',
      pattern: '  Green   Market  ',
    });

    expect(createdRule).toEqual(ruleStore.createdRule);
    expect(ruleStore.createdInput).toEqual({
      userId: '1',
      categoryId: '10',
      pattern: '  Green   Market  ',
      normalizedPattern: 'green market',
      matchType: 'exact',
    });
  });

  it('lists all owned rules, including rules attached to inactive categories', async () => {
    const rules = [
      ruleRecord({ id: '1', userId: '1', categoryId: '10' }),
      ruleRecord({ id: '2', userId: '1', categoryId: '11' }),
    ];
    const service = new CategoryRulesService(
      new CategoryRuleStoreFake(rules),
      new CategoryRuleCategoryStoreFake(),
    );

    await expect(service.listCategoryRules('1')).resolves.toEqual(rules);
  });

  it('returns the same not-found error for absent and cross-user rules', async () => {
    const service = new CategoryRulesService(
      new CategoryRuleStoreFake([ruleRecord({ userId: '2' })]),
      new CategoryRuleCategoryStoreFake(),
    );

    await expect(service.getCategoryRule('1', '1')).rejects.toBeInstanceOf(
      CategoryRuleNotFoundError,
    );
    await expect(service.getCategoryRule('1', '404')).rejects.toBeInstanceOf(
      CategoryRuleNotFoundError,
    );
  });

  it('rejects a new rule when its category is absent or inactive', async () => {
    const categoryStore = new CategoryRuleCategoryStoreFake([
      categoryRecord({ id: '10', userId: '1', isActive: false }),
    ]);
    const ruleStore = new CategoryRuleStoreFake();
    const service = new CategoryRulesService(ruleStore, categoryStore);

    await expect(
      service.createCategoryRule('1', {
        categoryId: '404',
        pattern: 'Groceries',
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(
      service.createCategoryRule('1', {
        categoryId: '10',
        pattern: 'Groceries',
      }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    expect(ruleStore.createdInput).toBeUndefined();
  });

  it('rejects a normalized duplicate for the same user', async () => {
    const ruleStore = new CategoryRuleStoreFake([
      ruleRecord({ userId: '1', normalizedPattern: 'green market' }),
    ]);
    const service = new CategoryRulesService(
      ruleStore,
      new CategoryRuleCategoryStoreFake([
        categoryRecord({ id: '10', userId: '1', isActive: true }),
      ]),
    );

    await expect(
      service.createCategoryRule('1', {
        categoryId: '10',
        pattern: ' GREEN\tMARKET ',
      }),
    ).rejects.toBeInstanceOf(CategoryRulePatternConflictError);
    expect(ruleStore.createdInput).toBeUndefined();
  });

  it("allows another user's rule to use the same normalized pattern", async () => {
    const ruleStore = new CategoryRuleStoreFake([
      ruleRecord({ userId: '2', normalizedPattern: 'green market' }),
    ]);
    const service = new CategoryRulesService(
      ruleStore,
      new CategoryRuleCategoryStoreFake([
        categoryRecord({ id: '10', userId: '1', isActive: true }),
      ]),
    );

    await expect(
      service.createCategoryRule('1', {
        categoryId: '10',
        pattern: ' GREEN\tMARKET ',
      }),
    ).resolves.toMatchObject({
      userId: '1',
      normalizedPattern: 'green market',
    });
  });

  it('hides a cross-user category reference as a category not-found error', async () => {
    const ruleStore = new CategoryRuleStoreFake();
    const service = new CategoryRulesService(
      ruleStore,
      new CategoryRuleCategoryStoreFake([
        categoryRecord({ id: '10', userId: '2', isActive: true }),
      ]),
    );

    await expect(
      service.createCategoryRule('1', {
        categoryId: '10',
        pattern: 'Groceries',
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
    expect(ruleStore.createdInput).toBeUndefined();
  });

  it('updates the display pattern without losing its exact normalized identity', async () => {
    const original = ruleRecord({
      id: '1',
      userId: '1',
      categoryId: '10',
      pattern: 'Green Market',
      normalizedPattern: 'green market',
    });
    const ruleStore = new CategoryRuleStoreFake([original]);
    const service = new CategoryRulesService(
      ruleStore,
      new CategoryRuleCategoryStoreFake([
        categoryRecord({ id: '10', userId: '1', isActive: false }),
      ]),
    );

    await expect(
      service.updateCategoryRule('1', '1', { pattern: 'green   market' }),
    ).resolves.toMatchObject({
      pattern: 'green   market',
      normalizedPattern: 'green market',
      categoryId: '10',
    });
    expect(ruleStore.updatedInput).toEqual({
      pattern: 'green   market',
      normalizedPattern: 'green market',
    });
  });

  it('allows maintaining a rule on an inactive category and reassigns it only to an active category', async () => {
    const original = ruleRecord({
      id: '1',
      userId: '1',
      categoryId: '10',
    });
    const ruleStore = new CategoryRuleStoreFake([original]);
    const categoryStore = new CategoryRuleCategoryStoreFake([
      categoryRecord({ id: '10', userId: '1', isActive: false }),
      categoryRecord({ id: '11', userId: '1', isActive: true }),
      categoryRecord({ id: '12', userId: '1', isActive: false }),
    ]);
    const service = new CategoryRulesService(ruleStore, categoryStore);

    await expect(
      service.updateCategoryRule('1', '1', { categoryId: '12' }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    await expect(
      service.updateCategoryRule('1', '1', { categoryId: '11' }),
    ).resolves.toMatchObject({ categoryId: '11' });
    expect(ruleStore.updatedInput).toEqual({ categoryId: '11' });
  });

  it('rejects an update that would reuse another normalized pattern', async () => {
    const ruleStore = new CategoryRuleStoreFake([
      ruleRecord({ id: '1', userId: '1', normalizedPattern: 'groceries' }),
      ruleRecord({ id: '2', userId: '1', normalizedPattern: 'dining out' }),
    ]);
    const service = new CategoryRulesService(
      ruleStore,
      new CategoryRuleCategoryStoreFake(),
    );

    await expect(
      service.updateCategoryRule('1', '1', { pattern: ' DINING\tOUT ' }),
    ).rejects.toBeInstanceOf(CategoryRulePatternConflictError);
    expect(ruleStore.updatedInput).toBeUndefined();
  });

  it('deletes an owned rule and reports an absent or cross-user rule as not found', async () => {
    const ruleStore = new CategoryRuleStoreFake([ruleRecord({ userId: '1' })]);
    const service = new CategoryRulesService(
      ruleStore,
      new CategoryRuleCategoryStoreFake(),
    );

    await expect(service.deleteCategoryRule('1', '1')).resolves.toBeUndefined();
    await expect(service.deleteCategoryRule('1', '1')).rejects.toBeInstanceOf(
      CategoryRuleNotFoundError,
    );
    await expect(service.deleteCategoryRule('1', '404')).rejects.toBeInstanceOf(
      CategoryRuleNotFoundError,
    );
  });

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
      service.createCategoryRuleInSpace('2', '10', {
        categoryId: '101',
        pattern: 'Shared Elsewhere',
      }),
    ).resolves.toMatchObject({
      spaceId: '10',
      categoryId: '101',
      normalizedPattern: 'shared elsewhere',
    });
    expect(ruleStore.createdInSpaceInput).toMatchObject({
      userId: '2',
      spaceId: '10',
      categoryId: '101',
    });

    await service.replaceCategoryRulesInSpace(
      '2',
      '10',
      '101',
      [{ pattern: 'Utilities', matchType: 'contains' }],
      '4',
    );
    expect(ruleStore.replaceForCategoryInSpace).toHaveBeenCalledWith(
      '2',
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
