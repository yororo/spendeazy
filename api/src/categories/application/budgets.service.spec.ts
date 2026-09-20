import type {
  BudgetRecord,
  BudgetStore,
  NewBudget,
  UpdateBudget,
} from './budget-store';
import type { CategoryRecord, CategoryStore } from './category-store';
import { BudgetsService } from './budgets.service';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from './category-errors';
import { BudgetNotFoundError } from './budget-errors';
import { StaleEditError } from '../../errors/application-error';

describe('BudgetsService', () => {
  it('creates a budget for an owned active category', async () => {
    const category = categoryRecord();
    const budget = budgetRecord();
    const categoryStore = new CategoryStoreFake(category);
    const budgetStore = new BudgetStoreFake({ createdBudget: budget });
    const service = new BudgetsService(categoryStore, budgetStore);

    await expect(
      service.putBudget('7', '42', { amount: '250.00', period: 'monthly' }),
    ).resolves.toEqual({ budget, created: true });
    expect(budgetStore.createdInput).toEqual({
      categoryId: '42',
      amount: '250.00',
      period: 'monthly',
    });
  });

  it('rejects a new budget for an inactive category', async () => {
    const category = categoryRecord({ isActive: false });
    const budgetStore = new BudgetStoreFake({ createdBudget: budgetRecord() });
    const service = new BudgetsService(
      new CategoryStoreFake(category),
      budgetStore,
    );

    await expect(
      service.putBudget('7', '42', { amount: '250.00', period: 'monthly' }),
    ).rejects.toBeInstanceOf(CategoryInactiveError);
    expect(budgetStore.createdInput).toBeUndefined();
  });

  it('replaces an existing budget while preserving its identity and creation time', async () => {
    const existingBudget = budgetRecord();
    const replacedBudget = budgetRecord({
      ...existingBudget,
      amount: '1200.00',
      period: 'yearly',
      updatedAt: new Date('2026-08-29T00:01:00.000Z'),
    });
    const budgetStore = new BudgetStoreFake({
      createdBudget: existingBudget,
      existingBudget,
      updatedBudget: replacedBudget,
    });
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord()),
      budgetStore,
    );

    await expect(
      service.putBudget('7', '42', { amount: '1200.00', period: 'yearly' }),
    ).resolves.toEqual({ budget: replacedBudget, created: false });
    expect(budgetStore.updatedInput).toEqual({
      amount: '1200.00',
      period: 'yearly',
    });
    expect(replacedBudget.id).toBe(existingBudget.id);
    expect(replacedBudget.createdAt).toBe(existingBudget.createdAt);
  });

  it('does not write an unchanged replacement', async () => {
    const existingBudget = budgetRecord();
    const budgetStore = new BudgetStoreFake({
      createdBudget: existingBudget,
      existingBudget,
    });
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord()),
      budgetStore,
    );

    await expect(
      service.putBudget('7', '42', { amount: '250.00', period: 'monthly' }),
    ).resolves.toEqual({ budget: existingBudget, created: false });
    expect(budgetStore.updatedInput).toBeUndefined();
  });

  it('allows replacement of an existing budget on an inactive category', async () => {
    const existingBudget = budgetRecord();
    const replacedBudget = budgetRecord({
      ...existingBudget,
      amount: '1200.00',
      period: 'yearly',
    });
    const budgetStore = new BudgetStoreFake({
      createdBudget: existingBudget,
      existingBudget,
      updatedBudget: replacedBudget,
    });
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord({ isActive: false })),
      budgetStore,
    );

    await expect(
      service.putBudget('7', '42', { amount: '1200.00', period: 'yearly' }),
    ).resolves.toEqual({ budget: replacedBudget, created: false });
  });

  it('uses the same category-not-found error for absent and cross-user categories', async () => {
    const input = { amount: '250.00' as const, period: 'monthly' as const };
    const absentService = new BudgetsService(
      new CategoryStoreFake(null),
      new BudgetStoreFake({ createdBudget: budgetRecord() }),
    );
    const crossUserService = new BudgetsService(
      new CategoryStoreFake(categoryRecord({ userId: '8' })),
      new BudgetStoreFake({ createdBudget: budgetRecord() }),
    );

    await expect(absentService.putBudget('7', '42', input)).rejects.toEqual(
      expect.any(CategoryNotFoundError),
    );
    await expect(crossUserService.putBudget('7', '42', input)).rejects.toEqual(
      expect.any(CategoryNotFoundError),
    );
  });

  it('retrieves the owned category budget', async () => {
    const budget = budgetRecord();
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord()),
      new BudgetStoreFake({ createdBudget: budget, existingBudget: budget }),
    );

    await expect(service.getBudget('7', '42')).resolves.toEqual(budget);
  });

  it('does not reveal another user category and distinguishes a missing budget', async () => {
    const missingBudgetService = new BudgetsService(
      new CategoryStoreFake(categoryRecord()),
      new BudgetStoreFake({ createdBudget: budgetRecord() }),
    );
    const crossUserService = new BudgetsService(
      new CategoryStoreFake(categoryRecord({ userId: '8' })),
      new BudgetStoreFake({ createdBudget: budgetRecord() }),
    );

    await expect(missingBudgetService.getBudget('7', '42')).rejects.toEqual(
      expect.any(BudgetNotFoundError),
    );
    await expect(crossUserService.getBudget('7', '42')).rejects.toEqual(
      expect.any(CategoryNotFoundError),
    );
  });

  it('removes a budget without removing its category', async () => {
    const budget = budgetRecord();
    const budgetStore = new BudgetStoreFake({
      createdBudget: budget,
      existingBudget: budget,
      deleteResult: true,
    });
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord()),
      budgetStore,
    );

    await expect(service.deleteBudget('7', '42')).resolves.toBeUndefined();
    expect(budgetStore.deletedCategoryId).toBe('42');
  });

  it('reports a missing budget when removal affects no row', async () => {
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord()),
      new BudgetStoreFake({ createdBudget: budgetRecord() }),
    );

    await expect(service.deleteBudget('7', '42')).rejects.toEqual(
      expect.any(BudgetNotFoundError),
    );
  });

  it('retrieves and removes an existing budget on an inactive category', async () => {
    const category = categoryRecord({ isActive: false });
    const budget = budgetRecord();
    const budgetStore = new BudgetStoreFake({
      createdBudget: budget,
      existingBudget: budget,
      deleteResult: true,
    });
    const service = new BudgetsService(
      new CategoryStoreFake(category),
      budgetStore,
    );

    await expect(service.getBudget('7', '42')).resolves.toEqual(budget);
    await expect(service.deleteBudget('7', '42')).resolves.toBeUndefined();
    expect(category.isActive).toBe(false);
  });

  it('keeps scoped Budget writes attached to the requested Space Category', async () => {
    const category = categoryRecord({ spaceId: '10' });
    const existingBudget = budgetRecord();
    const replacedBudget = budgetRecord({
      ...existingBudget,
      amount: '300.00',
    });
    const budgetStore = new BudgetStoreFake({
      createdBudget: existingBudget,
      existingBudget,
      updatedBudget: replacedBudget,
    });
    const service = new BudgetsService(
      new CategoryStoreFake(category),
      budgetStore,
    );

    await expect(
      service.putBudgetInSpace('10', '42', {
        amount: '300.00',
        period: 'monthly',
        expectedUpdatedAt: existingBudget.updatedAt.toISOString(),
      }),
    ).resolves.toEqual({ budget: replacedBudget, created: false });
    expect(budgetStore.updatedInput).toEqual({
      amount: '300.00',
      period: 'monthly',
      expectedUpdatedAt: existingBudget.updatedAt.toISOString(),
    });
  });

  it('rejects a Category that belongs to another Space', async () => {
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord({ spaceId: '11' })),
      new BudgetStoreFake({ createdBudget: budgetRecord() }),
    );

    await expect(service.getBudgetInSpace('10', '42')).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
  });

  it('rejects a stale scoped Budget replacement before writing', async () => {
    const existingBudget = budgetRecord();
    const budgetStore = new BudgetStoreFake({
      createdBudget: existingBudget,
      existingBudget,
      updatedBudget: budgetRecord({ ...existingBudget, amount: '300.00' }),
    });
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord({ spaceId: '10' })),
      budgetStore,
    );

    await expect(
      service.putBudgetInSpace('10', '42', {
        amount: '300.00',
        period: 'monthly',
        expectedUpdatedAt: '2026-08-28T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect(budgetStore.updatedInput).toBeUndefined();
  });

  it('rejects an unversioned scoped replacement when a Budget appeared after the read', async () => {
    const existingBudget = budgetRecord();
    const budgetStore = new BudgetStoreFake({
      createdBudget: existingBudget,
      existingBudget,
      updatedBudget: budgetRecord({ ...existingBudget, amount: '300.00' }),
    });
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord({ spaceId: '10' })),
      budgetStore,
    );

    await expect(
      service.putBudgetInSpace('10', '42', {
        amount: '300.00',
        period: 'monthly',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect(budgetStore.updatedInput).toBeUndefined();
  });

  it('rejects a scoped Budget create when another create wins the atomic insert', async () => {
    const budgetStore = new BudgetStoreFake({
      createdBudget: budgetRecord(),
      createIfAbsentConflict: true,
    });
    const service = new BudgetsService(
      new CategoryStoreFake(categoryRecord({ spaceId: '10' })),
      budgetStore,
    );

    await expect(
      service.putBudgetInSpace('10', '42', {
        amount: '300.00',
        period: 'monthly',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
  });
});

class CategoryStoreFake implements CategoryStore {
  constructor(private readonly category: CategoryRecord | null) {}

  findById(userId: string, id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(
      this.category?.userId === userId && this.category.id === id
        ? this.category
        : null,
    );
  }

  findAll(_userId: string): Promise<CategoryRecord[]> {
    void _userId;
    return Promise.resolve([]);
  }

  findByNormalizedName(
    _userId: string,
    _normalizedName: string,
  ): Promise<CategoryRecord | null> {
    void _userId;
    void _normalizedName;
    return Promise.resolve(null);
  }

  create(_input: never): Promise<CategoryRecord> {
    void _input;
    return Promise.reject(new Error('Not implemented'));
  }

  update(
    _userId: string,
    _id: string,
    _input: never,
  ): Promise<CategoryRecord | null> {
    void _userId;
    void _id;
    void _input;
    return Promise.reject(new Error('Not implemented'));
  }

  findBySpaceId(spaceId: string, id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(
      this.category?.spaceId === spaceId && this.category.id === id
        ? this.category
        : null,
    );
  }
}

class BudgetStoreFake implements BudgetStore {
  createdInput: NewBudget | undefined;
  updatedInput: UpdateBudget | undefined;
  deletedCategoryId: string | undefined;

  constructor(
    private readonly options: {
      createdBudget: BudgetRecord;
      existingBudget?: BudgetRecord;
      updatedBudget?: BudgetRecord;
      deleteResult?: boolean;
      createIfAbsentConflict?: boolean;
    },
  ) {}

  findByCategoryId(_categoryId: string): Promise<BudgetRecord | null> {
    void _categoryId;
    return Promise.resolve(this.options.existingBudget ?? null);
  }

  create(input: NewBudget): Promise<BudgetRecord> {
    this.createdInput = input;
    return Promise.resolve(this.options.createdBudget);
  }

  createIfAbsent(input: NewBudget): Promise<BudgetRecord | null> {
    this.createdInput = input;
    return Promise.resolve(
      this.options.createIfAbsentConflict ? null : this.options.createdBudget,
    );
  }

  update(
    _categoryId: string,
    input: UpdateBudget,
  ): Promise<BudgetRecord | null> {
    void _categoryId;
    this.updatedInput = input;
    return Promise.resolve(this.options.updatedBudget ?? null);
  }

  delete(categoryId: string): Promise<boolean> {
    this.deletedCategoryId = categoryId;
    return Promise.resolve(this.options.deleteResult ?? false);
  }
}

function categoryRecord(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '42',
    userId: '7',
    name: 'Groceries',
    description: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function budgetRecord(overrides: Partial<BudgetRecord> = {}): BudgetRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '100',
    categoryId: '42',
    amount: '250.00',
    period: 'monthly',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
