import { CategoryNotFoundError } from '../../categories/application/category-errors';
import { StaleEditError } from '../../errors/application-error';
import type {
  ExpenseCategoryRecord,
  ExpenseCategoryStore,
} from './expense-category-store';
import type {
  ManualExpenseRecord,
  NewManualExpense,
  SpaceExpensePageQuery,
  ExpenseRecord,
  SpaceExpenseStore,
  UpdateManualExpense,
} from './expense-store';
import type {
  NewExpenseActivity,
  ExpenseActivityRecord,
  ExpenseActivityStore,
} from './expense-activity-store';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  it('creates manual Expenses with immutable Space attribution and same-Space Categories', async () => {
    const expenseStore = new ExpenseStoreFake();
    const categoryStore = new ExpenseCategoryStoreFake([
      categoryRecord({ id: '42', spaceId: 'space-7' }),
      categoryRecord({ id: '43', spaceId: 'space-8' }),
    ]);
    const service = new ExpensesService(
      categoryStore,
      expenseStore,
      expenseStore,
    );

    const createdExpense = await service.createManualExpenseInSpace(
      'member-2',
      'space-7',
      {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: '  Shared dinner  ',
        amount: '12.99',
      },
    );

    expect(expenseStore.spaceCreatedInput).toEqual({
      spaceId: 'space-7',
      addedByUserId: 'member-2',
      categoryId: '42',
      expenseDate: '2026-08-01',
      description: 'Shared dinner',
      amount: '12.99',
    });
    expect(createdExpense).toMatchObject({
      spaceId: 'space-7',
      addedByUserId: 'member-2',
    });

    await expect(
      service.createManualExpenseInSpace('member-2', 'space-7', {
        categoryId: '43',
        expenseDate: '2026-08-02',
        description: 'Wrong Space Category',
        amount: '1.00',
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('preserves creator attribution and rejects stale Space edits and deletes', async () => {
    const expenseStore = new ExpenseStoreFake([
      expenseRecord({
        spaceId: 'space-7',
        addedByUserId: 'member-1',
      }),
    ]);
    const categoryStore = new ExpenseCategoryStoreFake([
      categoryRecord({ id: '42', spaceId: 'space-7' }),
      categoryRecord({ id: '43', spaceId: 'space-7' }),
    ]);
    const service = new ExpensesService(
      categoryStore,
      expenseStore,
      expenseStore,
    );

    const updatedExpense = await service.updateManualExpenseInSpace(
      'member-2',
      'space-7',
      '1',
      {
        categoryId: '43',
        description: ' Shared dinner ',
        expectedRevision: '1',
      },
    );

    expect(expenseStore.spaceUpdatedInput).toEqual({
      categoryId: '43',
      description: 'Shared dinner',
      expectedRevision: '1',
    });
    expect(expenseStore.spaceUpdatedActorUserId).toBe('member-2');
    expect(updatedExpense.addedByUserId).toBe('member-1');

    await expect(
      service.updateManualExpenseInSpace('member-2', 'space-7', '1', {
        description: 'Conflicting edit',
        expectedRevision: '1',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    await expect(
      service.deleteManualExpenseInSpace('member-2', 'space-7', '1', '1'),
    ).rejects.toBeInstanceOf(StaleEditError);
  });

  it('passes the deleting actor through the central mutation boundary', async () => {
    const expenseStore = new ExpenseStoreFake([
      expenseRecord({ spaceId: 'space-7' }),
    ]);
    const service = new ExpensesService(
      new ExpenseCategoryStoreFake(),
      expenseStore,
      expenseStore,
    );

    await service.deleteManualExpenseInSpace(
      'member-2',
      'space-7',
      '1',
      expenseStore.expenses[0].revision,
    );

    expect(expenseStore.spaceDeletedActorUserId).toBe('member-2');
  });

  it('lists a selected Space without rebinding the query to the current member', async () => {
    const expenseStore = new ExpenseStoreFake(
      [],
      [expensePageRecord({ spaceId: 'space-7' })],
    );
    const service = new ExpensesService(
      new ExpenseCategoryStoreFake(),
      expenseStore,
      expenseStore,
    );

    await expect(
      service.listExpensesInSpace('space-7', { pageSize: 20 }),
    ).resolves.toEqual({
      items: expenseStore.pageResults,
      nextCursor: null,
      totalCount: '1',
      totalAmount: '4.50',
    });
    expect(expenseStore.spacePageQuery).toEqual({
      spaceId: 'space-7',
      filters: {},
      after: null,
      pageSize: 20,
    });
  });

  it('returns only recorded activity for an existing Expense', async () => {
    const expense = expenseRecord({ id: '1', spaceId: 'space-7' });
    const expenseStore = new ExpenseStoreFake([expense]);
    const activityStore = new ExpenseActivityStoreFake([
      {
        id: '200',
        expenseId: '1',
        spaceId: 'space-7',
        actorUserId: 'member-2',
        type: 'created',
        occurredAt: expense.createdAt,
      },
    ]);
    const service = new ExpensesService(
      new ExpenseCategoryStoreFake(),
      expenseStore,
      expenseStore as never,
      activityStore,
    );

    await expect(
      service.listExpenseActivityInSpace('space-7', '1'),
    ).resolves.toEqual(activityStore.activities);
    await expect(
      service.listExpenseActivityInSpace('space-8', '1'),
    ).rejects.toMatchObject({ code: 'EXPENSE_NOT_FOUND' });
  });

  it('lists retained deleted Expenses separately from active pages', async () => {
    const expenseStore = new ExpenseStoreFake([
      expenseRecord({ id: '1', spaceId: 'space-7' }),
      expenseRecord({
        id: '2',
        spaceId: 'space-7',
        deletedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ]);
    const service = new ExpensesService(
      new ExpenseCategoryStoreFake(),
      expenseStore,
      expenseStore,
    );

    await expect(
      service.listDeletedExpensesInSpace('space-7', { pageSize: 20 }),
    ).resolves.toEqual({
      items: [toPageRecord(expenseStore.expenses[1])],
      nextCursor: null,
      totalCount: '1',
      totalAmount: '4.50',
    });
    expect(expenseStore.spacePageQuery).toMatchObject({
      spaceId: 'space-7',
      deletedOnly: true,
    });
  });
});

class ExpenseStoreFake implements SpaceExpenseStore {
  spaceCreatedInput: NewManualExpense | undefined;
  updatedExpense: ManualExpenseRecord | undefined;
  spaceUpdatedInput: UpdateManualExpense | undefined;
  spaceUpdatedActorUserId: string | undefined;
  spaceDeletedActorUserId: string | undefined;
  spacePageQuery: SpaceExpensePageQuery | undefined;
  pageResults: ExpenseRecord[];

  constructor(
    public readonly expenses: ManualExpenseRecord[] = [],
    pageResults: ExpenseRecord[] = [],
  ) {
    this.pageResults =
      pageResults.length > 0 ? pageResults : expenses.map(toPageRecord);
  }

  createInSpace(input: NewManualExpense): Promise<ManualExpenseRecord> {
    this.spaceCreatedInput = input;
    const createdExpense = expenseRecord({
      ...input,
      id: '2',
      source: 'manual',
    });
    this.expenses.push(createdExpense);
    return Promise.resolve(createdExpense);
  }

  findPageInSpace(query: SpaceExpensePageQuery): Promise<ExpenseRecord[]> {
    this.spacePageQuery = query;
    return Promise.resolve(
      this.pageResults.filter(
        (expense) =>
          expense.spaceId === query.spaceId &&
          (query.deletedOnly
            ? expense.deletedAt !== null
            : expense.deletedAt === null),
      ),
    );
  }

  async countInSpace(query: SpaceExpensePageQuery): Promise<number> {
    const page = await this.findPageInSpace(query);
    return page.length;
  }

  sumAmountInSpace(): Promise<string> {
    return Promise.resolve('4.50');
  }

  findByIdInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord | null> {
    return Promise.resolve(
      this.expenses.find(
        (expense) =>
          expense.spaceId === spaceId &&
          expense.id === id &&
          expense.deletedAt === null,
      ) ?? null,
    );
  }

  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateManualExpense,
    actorUserId: string,
  ): Promise<ManualExpenseRecord | null> {
    this.spaceUpdatedInput = input;
    this.spaceUpdatedActorUserId = actorUserId;
    const expense = this.expenses.find(
      (candidate) => candidate.spaceId === spaceId && candidate.id === id,
    );
    if (!expense) {
      return Promise.resolve(null);
    }

    const changes = { ...input };
    delete changes.expectedRevision;
    Object.assign(expense, changes);
    expense.revision = String(Number(expense.revision) + 1);
    this.updatedExpense = expense;
    return Promise.resolve(expense);
  }

  deleteInSpace(
    spaceId: string,
    id: string,
    actorUserId: string,
    expectedRevision: string,
  ): Promise<boolean> {
    this.spaceDeletedActorUserId = actorUserId;
    const expense = this.expenses.find(
      (candidate) =>
        candidate.spaceId === spaceId &&
        candidate.id === id &&
        candidate.deletedAt === null,
    );
    if (!expense) {
      return Promise.resolve(false);
    }
    if (expense.revision !== expectedRevision) return Promise.resolve(false);

    expense.deletedAt = new Date('2026-09-01T00:00:00.000Z');
    expense.revision = String(Number(expense.revision) + 1);
    return Promise.resolve(true);
  }

  findByIdInHistoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<ManualExpenseRecord | null> {
    return Promise.resolve(
      this.expenses.find(
        (expense) => expense.spaceId === spaceId && expense.id === id,
      ) ?? null,
    );
  }
}

class ExpenseCategoryStoreFake implements ExpenseCategoryStore {
  readonly spaceLookups: string[] = [];

  constructor(private readonly categories: ExpenseCategoryRecord[] = []) {}

  findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<ExpenseCategoryRecord | null> {
    this.spaceLookups.push(id);
    return Promise.resolve(
      this.categories.find(
        (category) => category.spaceId === spaceId && category.id === id,
      ) ?? null,
    );
  }
}

class ExpenseActivityStoreFake implements ExpenseActivityStore {
  constructor(public readonly activities: ExpenseActivityRecord[] = []) {}

  create(input: NewExpenseActivity): Promise<ExpenseActivityRecord> {
    const activity = { id: String(this.activities.length + 1), ...input };
    this.activities.push(activity);
    return Promise.resolve(activity);
  }

  findByExpenseInSpace(
    spaceId: string,
    expenseId: string,
  ): Promise<ExpenseActivityRecord[]> {
    return Promise.resolve(
      this.activities.filter(
        (activity) =>
          activity.spaceId === spaceId && activity.expenseId === expenseId,
      ),
    );
  }
}

function categoryRecord(
  overrides: Partial<ExpenseCategoryRecord> = {},
): ExpenseCategoryRecord {
  return {
    id: '42',
    spaceId: 'space-7',
    isActive: true,
    ...overrides,
  };
}

function expenseRecord(
  overrides: Partial<ManualExpenseRecord> = {},
): ManualExpenseRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    spaceId: 'space-7',
    addedByUserId: '7',
    categoryId: '42',
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: '1',
    deletedAt: null,
    ...overrides,
  };
}

function expensePageRecord(
  overrides: Partial<ExpenseRecord> = {},
): ExpenseRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    spaceId: 'space-7',
    addedByUserId: '7',
    categoryId: '42',
    statementImportId: null,
    expenseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: '1',
    deletedAt: null,
    ...overrides,
  };
}

function toPageRecord(expense: ManualExpenseRecord): ExpenseRecord {
  return {
    ...expense,
    statementImportId: null,
  };
}
