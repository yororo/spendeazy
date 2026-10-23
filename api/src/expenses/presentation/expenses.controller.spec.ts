import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type {
  ListExpensesInput,
  ExpensesService,
} from '../application/expenses.service';
import type {
  ManualExpenseRecord,
  ExpenseRecord,
} from '../application/expense-store';
import type { ExpenseActivityRecord } from '../application/expense-activity-store';
import { ExpensesController } from './expenses.controller';

describe('ExpensesController', () => {
  it('returns a created manual expense with canonical Location and API encodings', async () => {
    const expense = expenseRecord();
    const expensesService = {
      createManualExpenseInSpace: jest.fn().mockResolvedValue(expense),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      personalSpaceAccess(),
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await expect(
      controller.createManualExpense(
        authenticatedRequest(),
        {
          categoryId: '42',
          purchaseDate: expense.purchaseDate,
          description: expense.description,
          amount: expense.amount,
        },
        response,
      ),
    ).resolves.toEqual({
      id: '100',
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      source: 'manual',
      createdAt: '2026-08-29T00:00:00.123Z',
      updatedAt: '2026-08-29T00:00:00.456Z',
    });

    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/expenses/100',
    );
  });

  it('maps a expense history page without changing the service query', async () => {
    const expense = expenseRecord();
    const query: ListExpensesInput = {
      fromDate: '2026-08-01',
      pageSize: 10,
    };
    const expensesService = {
      listExpensesInSpace: jest.fn().mockResolvedValue({
        items: [expense],
        nextCursor: 'next-page',
        totalCount: '1',
      }),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listExpenses(authenticatedRequest(), query),
    ).resolves.toEqual({
      items: [
        {
          id: '100',
          categoryId: '42',
          statementImportId: null,
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          source: 'manual',
          createdAt: '2026-08-29T00:00:00.123Z',
          updatedAt: '2026-08-29T00:00:00.456Z',
        },
      ],
      nextCursor: 'next-page',
      totalCount: '1',
    });

    expect(expensesService.listExpensesInSpace).toHaveBeenCalledWith(
      '9',
      query,
    );
  });

  it('lists retained deleted Expenses through the Personal Space boundary', async () => {
    const deletedAt = new Date('2026-09-20T00:01:00.000Z');
    const expense = expenseRecord();
    const expensesService = {
      listDeletedExpensesInSpace: jest.fn().mockResolvedValue({
        items: [{ ...expense, deletedAt }],
        nextCursor: null,
        totalCount: '1',
      }),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listDeletedExpenses(authenticatedRequest(), {}),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: '100',
          source: 'manual',
          deletedAt: deletedAt.toISOString(),
        }),
      ],
      nextCursor: null,
      totalCount: '1',
    });

    expect(expensesService.listDeletedExpensesInSpace).toHaveBeenCalledWith(
      '9',
      {},
    );
  });

  it('maps imported expense history with its statement relationship and nullable category', async () => {
    const expense = importedExpenseRecord();
    expense.categoryId = null;
    const expensesService = {
      listExpensesInSpace: jest.fn().mockResolvedValue({
        items: [expense],
        nextCursor: null,
        totalCount: '1',
      }),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listExpenses(authenticatedRequest(), {}),
    ).resolves.toEqual({
      items: [
        {
          id: '100',
          categoryId: null,
          statementImportId: '10',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          source: 'imported',
          createdAt: '2026-08-29T00:00:00.000Z',
          updatedAt: '2026-08-29T00:00:00.000Z',
        },
      ],
      nextCursor: null,
      totalCount: '1',
    });
  });

  it('authorizes the Personal Space before returning Expense activity', async () => {
    const listExpenseActivityInSpace = jest
      .fn()
      .mockResolvedValue([activityRecord()]);
    const expensesService = {
      listExpenseActivityInSpace,
    };
    const requirePersonalSpace = jest.fn().mockResolvedValue({ id: '9' });
    const spaceAccessService = {
      requirePersonalSpace,
      requirePersonalWriteSpace: jest.fn().mockResolvedValue({ id: '9' }),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService,
    );

    await expect(
      controller.listExpenseActivity(authenticatedRequest(), {
        expenseId: '100',
      }),
    ).resolves.toEqual([
      {
        id: '200',
        expenseId: '100',
        type: 'created',
        actorUserId: '8',
        occurredAt: '2026-08-29T00:00:00.123Z',
      },
    ]);

    expect(requirePersonalSpace).toHaveBeenCalledWith('7');
    expect(listExpenseActivityInSpace).toHaveBeenCalledWith('9', '100');
  });

  it('returns before-and-after values for an edited activity event', async () => {
    const expensesService = {
      listExpenseActivityInSpace: jest
        .fn()
        .mockResolvedValue([editedActivityRecord()]),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listExpenseActivity(authenticatedRequest(), {
        expenseId: '100',
      }),
    ).resolves.toEqual([
      {
        id: '201',
        expenseId: '100',
        type: 'edited',
        actorUserId: '8',
        occurredAt: '2026-09-20T00:00:00.123Z',
        before: {
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
        after: {
          categoryId: '43',
          purchaseDate: '2026-08-01',
          description: 'Dinner',
          amount: '4.50',
        },
      },
    ]);
  });

  it('maps a deletion activity without inventing an after-state', async () => {
    const expensesService = {
      listExpenseActivityInSpace: jest.fn().mockResolvedValue([
        {
          id: '202',
          expenseId: '100',
          spaceId: '9',
          actorUserId: '8',
          type: 'deleted' as const,
          occurredAt: new Date('2026-09-20T00:02:00.000Z'),
        },
      ]),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listExpenseActivity(authenticatedRequest(), {
        expenseId: '100',
      }),
    ).resolves.toEqual([
      {
        id: '202',
        expenseId: '100',
        type: 'deleted',
        actorUserId: '8',
        occurredAt: '2026-09-20T00:02:00.000Z',
      },
    ]);
  });

  it('returns an imported expense after a category-only patch', async () => {
    const expense = importedExpenseRecord();
    const expensesService = {
      updateExpenseInSpace: jest.fn().mockResolvedValue(expense),
    };
    const controller = new ExpensesController(
      expensesService as unknown as ExpensesService,
      personalSpaceAccess(),
    );

    await expect(
      controller.updateExpense(
        authenticatedRequest(),
        { expenseId: '100' },
        { categoryId: '43' },
      ),
    ).resolves.toEqual({
      id: '100',
      categoryId: '43',
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      source: 'imported',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    });

    expect(expensesService.updateExpenseInSpace).toHaveBeenCalledWith(
      '7',
      '9',
      '100',
      { categoryId: '43' },
    );
  });
});

function expenseRecord(): ManualExpenseRecord {
  return {
    id: '100',
    userId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
    deletedAt: null,
  };
}

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}

function personalSpaceAccess(): SpaceAccessService {
  return {
    requirePersonalSpace: jest.fn().mockResolvedValue({ id: '9' }),
    requirePersonalWriteSpace: jest.fn().mockResolvedValue({ id: '9' }),
  } as unknown as SpaceAccessService;
}

function importedExpenseRecord(): ExpenseRecord {
  return {
    id: '100',
    userId: '7',
    categoryId: '43',
    statementImportId: '10',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'imported',
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    deletedAt: null,
  };
}

function activityRecord(): ExpenseActivityRecord {
  return {
    id: '200',
    expenseId: '100',
    spaceId: '9',
    actorUserId: '8',
    type: 'created',
    occurredAt: new Date('2026-08-29T00:00:00.123Z'),
  };
}

function editedActivityRecord(): ExpenseActivityRecord {
  return {
    id: '201',
    expenseId: '100',
    spaceId: '9',
    actorUserId: '8',
    type: 'edited',
    occurredAt: new Date('2026-09-20T00:00:00.123Z'),
    before: {
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
    },
    after: {
      categoryId: '43',
      purchaseDate: '2026-08-01',
      description: 'Dinner',
      amount: '4.50',
    },
  };
}
