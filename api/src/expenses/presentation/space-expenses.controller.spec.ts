import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { ExpensesService } from '../application/expenses.service';
import type { ManualExpenseRecord } from '../application/expense-store';
import type { ExpenseActivityRecord } from '../application/expense-activity-store';
import { SpaceExpensesController } from './space-expenses.controller';

describe('SpaceExpensesController', () => {
  it('checks membership and exposes immutable creator attribution on history rows', async () => {
    const expense = expenseRecord({ addedByUserId: '8' });
    const expensesService = {
      listExpensesInSpace: jest.fn().mockResolvedValue({
        items: [expense],
        nextCursor: null,
        totalCount: '1',
      }),
    };
    const spaceAccessService = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.listExpenses(
        authenticatedRequest('7'),
        { spaceId: '10' },
        {},
      ),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: '100',
          source: 'manual',
          addedByUserId: '8',
          statementImportId: null,
        }),
      ],
      nextCursor: null,
      totalCount: '1',
    });

    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
    expect(expensesService.listExpensesInSpace).toHaveBeenCalledWith(
      '10',
      {},
    );
  });

  it('checks membership before listing retained deleted Expenses', async () => {
    const deletedAt = new Date('2026-09-20T00:01:00.000Z');
    const expensesService = {
      listDeletedExpensesInSpace: jest.fn().mockResolvedValue({
        items: [{ ...expenseRecord(), deletedAt }],
        nextCursor: null,
        totalCount: '1',
      }),
    };
    const spaceAccessService = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.listDeletedExpenses(
        authenticatedRequest('7'),
        { spaceId: '10' },
        {},
      ),
    ).resolves.toEqual({
      items: [expect.objectContaining({ deletedAt: deletedAt.toISOString() })],
      nextCursor: null,
      totalCount: '1',
    });
    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
    expect(
      expensesService.listDeletedExpensesInSpace,
    ).toHaveBeenCalledWith('10', {});
  });

  it('uses equal Space write access for creation and maps the scoped Location', async () => {
    const expense = expenseRecord({ addedByUserId: '7' });
    const expensesService = {
      createManualExpenseInSpace: jest.fn().mockResolvedValue(expense),
    };
    const spaceAccessService = {
      requireWriteAccess: jest
        .fn()
        .mockResolvedValue({ id: '10', kind: 'shared' }),
    };
    const status = jest.fn();
    const setHeader = jest.fn();
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.createExpense(
        authenticatedRequest('7'),
        { spaceId: '10' },
        {
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          categoryId: '42',
        },
        { status, setHeader } as unknown as Response,
      ),
    ).resolves.toEqual(expect.objectContaining({ addedByUserId: '7' }));

    expect(spaceAccessService.requireWriteAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
    expect(
      expensesService.createManualExpenseInSpace,
    ).toHaveBeenCalledWith('7', '10', {
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      categoryId: '42',
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/spaces/10/expenses/100',
    );
  });

  it('checks Space membership before returning Expense activity', async () => {
    const expensesService = {
      listExpenseActivityInSpace: jest
        .fn()
        .mockResolvedValue([activityRecord()]),
    };
    const spaceAccessService = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.listExpenseActivity(authenticatedRequest('7'), {
        spaceId: '10',
        expenseId: '100',
      }),
    ).resolves.toEqual([
      {
        id: '200',
        expenseId: '100',
        type: 'created',
        actorUserId: '8',
        occurredAt: '2026-09-20T00:00:00.000Z',
      },
    ]);

    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
    expect(
      expensesService.listExpenseActivityInSpace,
    ).toHaveBeenCalledWith('10', '100');
  });

  it('passes the authoritative version for edits and If-Match for deletes', async () => {
    const expense = expenseRecord();
    const expensesService = {
      updateSharedExpenseInSpace: jest.fn().mockResolvedValue(expense),
      deleteExpenseInSpace: jest.fn().mockResolvedValue(undefined),
    };
    const spaceAccessService = {
      requireWriteAccess: jest
        .fn()
        .mockResolvedValue({ id: '10', kind: 'shared' }),
    };
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await controller.updateExpense(
      authenticatedRequest('7'),
      { spaceId: '10', expenseId: '100' },
      {
        description: 'Dinner',
        updatedAt: expense.updatedAt.toISOString(),
      },
    );
    await controller.deleteExpense(
      authenticatedRequest('7'),
      { spaceId: '10', expenseId: '100' },
      `W/"${expense.updatedAt.toISOString()}"`,
    );

    expect(
      expensesService.updateSharedExpenseInSpace,
    ).toHaveBeenCalledWith('7', '10', '100', {
      description: 'Dinner',
      expectedUpdatedAt: expense.updatedAt.toISOString(),
    });
    expect(expensesService.deleteExpenseInSpace).toHaveBeenCalledWith(
      '7',
      '10',
      '100',
      expense.updatedAt.toISOString(),
    );
  });

  it('keeps the legacy Personal Space mutation boundary', async () => {
    const expense = expenseRecord();
    const expensesService = {
      updateExpenseInSpace: jest.fn().mockResolvedValue(expense),
      deleteManualExpenseInSpace: jest.fn().mockResolvedValue(undefined),
      updateSharedExpenseInSpace: jest.fn(),
      deleteExpenseInSpace: jest.fn(),
    };
    const spaceAccessService = {
      requireWriteAccess: jest
        .fn()
        .mockResolvedValue({ id: '10', kind: 'personal' }),
    };
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await controller.updateExpense(
      authenticatedRequest('7'),
      { spaceId: '10', expenseId: '100' },
      {
        categoryId: '43',
        updatedAt: expense.updatedAt.toISOString(),
      },
    );
    await controller.deleteExpense(
      authenticatedRequest('7'),
      { spaceId: '10', expenseId: '100' },
      expense.updatedAt.toISOString(),
    );

    expect(expensesService.updateExpenseInSpace).toHaveBeenCalledWith(
      '7',
      '10',
      '100',
      {
        categoryId: '43',
        expectedUpdatedAt: expense.updatedAt.toISOString(),
      },
    );
    expect(
      expensesService.deleteManualExpenseInSpace,
    ).toHaveBeenCalledWith(
      '7',
      '10',
      '100',
      expense.updatedAt.toISOString(),
    );
    expect(
      expensesService.updateSharedExpenseInSpace,
    ).not.toHaveBeenCalled();
    expect(expensesService.deleteExpenseInSpace).not.toHaveBeenCalled();
  });

  it('rejects Space writes without a concurrency version', async () => {
    const expensesService = {
      updateSharedExpenseInSpace: jest.fn(),
      deleteExpenseInSpace: jest.fn(),
    };
    const spaceAccessService = {
      requireWriteAccess: jest
        .fn()
        .mockResolvedValue({ id: '10', kind: 'shared' }),
    };
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.updateExpense(
        authenticatedRequest('7'),
        { spaceId: '10', expenseId: '100' },
        { description: 'Dinner' } as never,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        expect.objectContaining({ field: '/updatedAt', code: 'required' }),
      ],
    });
    await expect(
      controller.deleteExpense(authenticatedRequest('7'), {
        spaceId: '10',
        expenseId: '100',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        expect.objectContaining({
          field: '/headers/if-match',
          code: 'required',
        }),
      ],
    });
    expect(
      expensesService.updateSharedExpenseInSpace,
    ).not.toHaveBeenCalled();
    expect(expensesService.deleteExpenseInSpace).not.toHaveBeenCalled();
  });
});

function expenseRecord(
  overrides: Partial<ManualExpenseRecord> = {},
): ManualExpenseRecord {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '100',
    userId: '7',
    spaceId: '10',
    addedByUserId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function authenticatedRequest(userId: string): AuthenticatedRequest {
  return { authenticatedUserId: userId } as AuthenticatedRequest;
}

function activityRecord(): ExpenseActivityRecord {
  return {
    id: '200',
    expenseId: '100',
    spaceId: '10',
    actorUserId: '8',
    type: 'created',
    occurredAt: new Date('2026-09-20T00:00:00.000Z'),
  };
}
