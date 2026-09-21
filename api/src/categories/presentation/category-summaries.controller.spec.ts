import type { CategorySummariesService } from '../application/category-summaries.service';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import { CategorySummariesController } from './category-summaries.controller';

describe('CategorySummariesController', () => {
  it('passes the Personal Space and period query through and preserves string encodings', async () => {
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
      getCategorySummaryInSpace: jest.fn().mockResolvedValue(result),
    };
    const controller = new CategorySummariesController(
      categorySummariesService as unknown as CategorySummariesService,
      personalSpaceAccess(),
    );

    await expect(
      controller.getCategorySummary(authenticatedRequest(), query),
    ).resolves.toEqual(result);
    expect(
      categorySummariesService.getCategorySummaryInSpace,
    ).toHaveBeenCalledWith('9', query);
  });
});

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}

function personalSpaceAccess(): SpaceAccessService {
  return {
    requirePersonalSpace: jest.fn().mockResolvedValue({ id: '9' }),
    requirePersonalWriteSpace: jest.fn().mockResolvedValue({ id: '9' }),
  } as unknown as SpaceAccessService;
}
