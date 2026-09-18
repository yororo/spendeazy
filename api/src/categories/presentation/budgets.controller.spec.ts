import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { BudgetRecord, BudgetPeriod } from '../application/budget-store';
import type { BudgetsService } from '../application/budgets.service';
import { BudgetsController } from './budgets.controller';

describe('BudgetsController', () => {
  it('returns a created budget with string identifiers and money and a canonical Location', async () => {
    const budget = budgetRecord();
    const budgetsService = {
      putBudget: jest.fn().mockResolvedValue({ budget, created: true }),
    };
    const controller = new BudgetsController(
      budgetsService as unknown as BudgetsService,
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await expect(
      controller.putBudget(
        authenticatedRequest(),
        { categoryId: '42' },
        { amount: '250.00', period: 'monthly' },
        response,
      ),
    ).resolves.toEqual({
      id: '100',
      categoryId: '42',
      amount: '250.00',
      period: 'monthly',
      createdAt: '2026-08-29T00:00:00.123Z',
      updatedAt: '2026-08-29T00:00:00.456Z',
    });

    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/categories/42/budget',
    );
  });
});

function budgetRecord(): BudgetRecord {
  return {
    id: '100',
    categoryId: '42',
    amount: '250.00',
    period: 'monthly' satisfies BudgetPeriod,
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}
