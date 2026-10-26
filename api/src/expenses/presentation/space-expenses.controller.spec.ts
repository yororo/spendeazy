import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { ExpensesService } from '../application/expenses.service';
import type { ManualExpenseRecord } from '../application/expense-store';
import type { ExpenseActivityRecord } from '../application/expense-activity-store';
import { SpaceExpensesController } from './space-expenses.controller';

describe('SpaceExpensesController', () => {
  it('returns canonical Expense collection fields after Space authorization', async () => {
    const expense = expenseRecord();
    const expensesService = {
      listExpensesInSpace: jest.fn().mockResolvedValue({
        items: [expense],
        nextCursor: null,
        totalCount: '1',
        totalAmount: '4.50',
      }),
    };
    const access = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceExpensesController(
      expensesService as unknown as ExpensesService,
      access as unknown as SpaceAccessService,
    );

    await expect(
      controller.listExpenses(authenticatedRequest('7'), { spaceId: '10' }, {}),
    ).resolves.toEqual({
      expenses: [
        expect.objectContaining({
          id: '100',
          source: 'manual',
          categoryId: '42',
          expenseDate: '2026-08-01',
          revision: '1',
          statementImportId: null,
        }),
      ],
      nextCursor: null,
      totalCount: '1',
      totalAmount: '4.50',
    });
    expect(access.requireReadAccess).toHaveBeenCalledWith('7', '10');
  });

  it('returns the deletion marker when reading retained Expense history', async () => {
    const deletedAt = new Date('2026-09-20T00:00:00.000Z');
    const service = {
      getExpenseInSpace: jest
        .fn()
        .mockResolvedValue(expenseRecord({ deletedAt, revision: '2' })),
    };
    const access = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceExpensesController(
      service as unknown as ExpensesService,
      access as unknown as SpaceAccessService,
    );

    await expect(
      controller.getExpense(authenticatedRequest('7'), {
        spaceId: '10',
        expenseId: '100',
      }),
    ).resolves.toMatchObject({
      id: '100',
      revision: '2',
      deletedAt: deletedAt.toISOString(),
    });
    expect(service.getExpenseInSpace).toHaveBeenCalledWith('10', '100');
    expect(access.requireReadAccess).toHaveBeenCalledWith('7', '10');
  });

  it('creates an Expense and returns its Space-scoped Location', async () => {
    const expense = expenseRecord();
    const service = {
      createManualExpenseInSpace: jest.fn().mockResolvedValue(expense),
    };
    const access = {
      requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceExpensesController(
      service as unknown as ExpensesService,
      access as unknown as SpaceAccessService,
    );
    const status = jest.fn();
    const setHeader = jest.fn();

    await expect(
      controller.createExpense(
        authenticatedRequest('7'),
        { spaceId: '10' },
        {
          expenseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          categoryId: '42',
        },
        { status, setHeader } as unknown as Response,
      ),
    ).resolves.toMatchObject({ id: '100', revision: '1' });
    expect(service.createManualExpenseInSpace).toHaveBeenCalledWith('7', '10', {
      expenseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      categoryId: '42',
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/spaces/10/expenses/100',
    );
  });

  it('passes expectedRevision for updates and If-Match for retained deletes', async () => {
    const expense = expenseRecord();
    const service = {
      updateSharedExpenseInSpace: jest.fn().mockResolvedValue(expense),
      deleteExpenseInSpace: jest.fn().mockResolvedValue({
        ...expense,
        deletedAt: new Date('2026-09-20T00:00:00.000Z'),
        revision: '2',
      }),
    };
    const access = {
      requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceExpensesController(
      service as unknown as ExpensesService,
      access as unknown as SpaceAccessService,
    );

    await controller.updateExpense(
      authenticatedRequest('7'),
      { spaceId: '10', expenseId: '100' },
      { description: 'Dinner', expectedRevision: '1' },
    );
    await controller.deleteExpense(
      authenticatedRequest('7'),
      { spaceId: '10', expenseId: '100' },
      'W/"1"',
    );
    expect(service.updateSharedExpenseInSpace).toHaveBeenCalledWith(
      '7',
      '10',
      '100',
      { description: 'Dinner', expectedRevision: '1' },
    );
    expect(service.deleteExpenseInSpace).toHaveBeenCalledWith(
      '7',
      '10',
      '100',
      '1',
    );
  });

  it('rejects writes without a revision precondition', async () => {
    const service = {
      updateSharedExpenseInSpace: jest.fn(),
      deleteExpenseInSpace: jest.fn(),
    };
    const controller = new SpaceExpensesController(
      service as unknown as ExpensesService,
      {
        requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
      } as unknown as SpaceAccessService,
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
        expect.objectContaining({
          field: '/expectedRevision',
          code: 'required',
        }),
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
    expect(service.updateSharedExpenseInSpace).not.toHaveBeenCalled();
    expect(service.deleteExpenseInSpace).not.toHaveBeenCalled();
  });

  it('maps Expense activity snapshots with canonical IDs', async () => {
    const activity: ExpenseActivityRecord = {
      id: '200',
      expenseId: '100',
      spaceId: '10',
      actorUserId: '7',
      type: 'created',
      occurredAt: new Date('2026-09-20T00:00:00.000Z'),
      after: {
        categoryId: '42',
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    };
    const service = {
      listExpenseActivityInSpace: jest.fn().mockResolvedValue([activity]),
    };
    const controller = new SpaceExpensesController(
      service as unknown as ExpensesService,
      {
        requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
      } as unknown as SpaceAccessService,
    );
    await expect(
      controller.listExpenseActivity(authenticatedRequest('7'), {
        spaceId: '10',
        expenseId: '100',
      }),
    ).resolves.toMatchObject([
      { expenseId: '100', after: { expenseDate: '2026-08-01' } },
    ]);
  });
});

function expenseRecord(
  overrides: Partial<ManualExpenseRecord> = {},
): ManualExpenseRecord {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '100',
    spaceId: '10',
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

function authenticatedRequest(userId: string): AuthenticatedRequest {
  return { authenticatedUserId: userId } as AuthenticatedRequest;
}
