import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { BudgetRecord } from '../application/budget-store';
import type { BudgetsService } from '../application/budgets.service';
import { SpaceBudgetsController } from './space-budgets.controller';

describe('SpaceBudgetsController', () => {
  it('writes a Budget through the authorized Space route with its version', async () => {
    const budget = budgetRecord();
    const putBudgetInSpace = jest
      .fn()
      .mockResolvedValue({ budget, created: true });
    const budgetsService = {
      putBudgetInSpace,
    };
    const requireWriteAccess = jest.fn().mockResolvedValue({ id: '10' });
    const spaceAccessService = {
      requireWriteAccess,
    };
    const controller = new SpaceBudgetsController(
      budgetsService as unknown as BudgetsService,
      spaceAccessService as unknown as SpaceAccessService,
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await controller.putBudget(
      authenticatedRequest('7'),
      { spaceId: '10', categoryId: '42' },
      {
        amount: '250.00',
        period: 'monthly',
        updatedAt: budget.updatedAt.toISOString(),
      },
      response,
    );

    expect(requireWriteAccess).toHaveBeenCalledWith('7', '10');
    expect(putBudgetInSpace).toHaveBeenCalledWith('10', '42', {
      amount: '250.00',
      period: 'monthly',
      expectedUpdatedAt: budget.updatedAt.toISOString(),
    });
    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/spaces/10/categories/42/budget',
    );
  });

  it('passes If-Match through to scoped Budget deletion', async () => {
    const deleteBudgetInSpace = jest.fn().mockResolvedValue(undefined);
    const budgetsService = {
      deleteBudgetInSpace,
    };
    const requireWriteAccess = jest.fn().mockResolvedValue({ id: '10' });
    const spaceAccessService = {
      requireWriteAccess,
    };
    const controller = new SpaceBudgetsController(
      budgetsService as unknown as BudgetsService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await controller.deleteBudget(
      authenticatedRequest('7'),
      { spaceId: '10', categoryId: '42' },
      'W/"2026-09-20T00:00:00.000Z"',
    );

    expect(deleteBudgetInSpace).toHaveBeenCalledWith(
      '10',
      '42',
      '2026-09-20T00:00:00.000Z',
    );
  });
});

function budgetRecord(): BudgetRecord {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '100',
    categoryId: '42',
    amount: '250.00',
    period: 'monthly',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function authenticatedRequest(userId: string): AuthenticatedRequest {
  return { authenticatedUserId: userId } as AuthenticatedRequest;
}
