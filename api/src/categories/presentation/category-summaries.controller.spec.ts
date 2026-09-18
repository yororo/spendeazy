import type { CategorySummariesService } from '../application/category-summaries.service';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import { CategorySummariesController } from './category-summaries.controller';

describe('CategorySummariesController', () => {
  it('passes the user and period query through and preserves string encodings', async () => {
    const query = { period: 'monthly' as const, year: '2026', month: '08' };
    const result = {
      period: 'monthly' as const,
      year: '2026',
      month: '08',
      categories: [
        {
          categoryId: '42',
          name: 'Groceries',
          isActive: true,
          totalAmount: '10.00',
          transactionCount: '1',
          budgetAmount: '20.00',
          remainingAmount: '10.00',
        },
      ],
      uncategorizedTotal: '0.00',
      uncategorizedCount: '0',
    };
    const categorySummariesService = {
      getCategorySummary: jest.fn().mockResolvedValue(result),
    };
    const controller = new CategorySummariesController(
      categorySummariesService as unknown as CategorySummariesService,
    );

    await expect(
      controller.getCategorySummary(authenticatedRequest(), query),
    ).resolves.toEqual(result);
    expect(categorySummariesService.getCategorySummary).toHaveBeenCalledWith(
      '7',
      query,
    );
  });
});

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}
