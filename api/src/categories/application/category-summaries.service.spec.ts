import type {
  CategorySummaryData,
  CategorySummaryStore,
} from './category-summary-store';
import { CategorySummariesService } from './category-summaries.service';

describe('CategorySummariesService', () => {
  it('returns deterministic category totals with matching budgets and Uncategorized spending', async () => {
    const store = new CategorySummaryStoreFake('7', {
      categories: [
        categorySummary({
          categoryId: '8',
          categoryName: 'Inactive historical',
          categoryIsActive: false,
          totalAmount: '12.35',
          transactionCount: '2',
          budgetAmount: '10.00',
          budgetPeriod: 'monthly',
        }),
        categorySummary({
          categoryId: '2',
          categoryName: 'Empty active',
          totalAmount: '0',
          transactionCount: '0',
          budgetAmount: '1200.00',
          budgetPeriod: 'yearly',
        }),
        categorySummary({
          categoryId: '3',
          categoryName: 'Groceries',
          totalAmount: '10.10',
          transactionCount: '3',
          budgetAmount: '20.00',
          budgetPeriod: 'monthly',
        }),
      ],
      uncategorizedAmount: '4.5',
      uncategorizedCount: '1',
    });
    const service = new CategorySummariesService(store);

    await expect(
      service.getCategorySummaryInSpace('7', {
        period: 'monthly',
        year: '2026',
        month: '08',
      }),
    ).resolves.toEqual({
      period: 'monthly',
      year: '2026',
      month: '08',
      categories: [
        {
          categoryId: '2',
          name: 'Empty active',
          isActive: true,
          totalAmount: '0.00',
          transactionCount: '0',
          budgetAmount: null,
          remainingAmount: null,
        },
        {
          categoryId: '3',
          name: 'Groceries',
          isActive: true,
          totalAmount: '10.10',
          transactionCount: '3',
          budgetAmount: '20.00',
          remainingAmount: '9.90',
        },
        {
          categoryId: '8',
          name: 'Inactive historical',
          isActive: false,
          totalAmount: '12.35',
          transactionCount: '2',
          budgetAmount: '10.00',
          remainingAmount: '-2.35',
        },
      ],
      uncategorizedTotal: '4.50',
      uncategorizedCount: '1',
    });

    expect(store.query).toEqual({
      spaceId: '7',
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    });
  });

  it('uses the complete leap-year calendar range for yearly summaries and isolates users', async () => {
    const store = new CategorySummaryStoreFake('99', {
      categories: [categorySummary()],
      uncategorizedAmount: '0.00',
      uncategorizedCount: '0',
    });
    const service = new CategorySummariesService(store);

    await expect(
      service.getCategorySummaryInSpace('99', {
        period: 'yearly',
        year: '2028',
      }),
    ).resolves.toMatchObject({
      period: 'yearly',
      year: '2028',
      month: null,
      categories: [{ categoryId: '1' }],
    });
    expect(store.query?.spaceId).toBe('99');

    const otherUserStore = new CategorySummaryStoreFake('7', {
      categories: [categorySummary({ categoryId: '2' })],
      uncategorizedAmount: '0.00',
      uncategorizedCount: '0',
    });
    await expect(
      new CategorySummariesService(otherUserStore).getCategorySummaryInSpace(
        '99',
        {
          period: 'yearly',
          year: '2028',
        },
      ),
    ).resolves.toMatchObject({ categories: [], uncategorizedTotal: '0.00' });
  });
});

class CategorySummaryStoreFake implements CategorySummaryStore {
  query: { spaceId: string; fromDate: string; toDate: string } | undefined;

  constructor(
    private readonly ownerSpaceId: string,
    private readonly data: CategorySummaryData,
  ) {}

  findSummary(query: {
    spaceId: string;
    fromDate: string;
    toDate: string;
  }): Promise<CategorySummaryData> {
    this.query = query;
    return Promise.resolve(
      query.spaceId === this.ownerSpaceId
        ? this.data
        : {
            categories: [],
            uncategorizedAmount: '0.00',
            uncategorizedCount: '0',
          },
    );
  }
}

function categorySummary(
  overrides: Partial<CategorySummaryData['categories'][number]> = {},
): CategorySummaryData['categories'][number] {
  return {
    categoryId: '1',
    categoryName: 'Category',
    categoryIsActive: true,
    totalAmount: '1.00',
    transactionCount: '1',
    budgetAmount: null,
    budgetPeriod: null,
    ...overrides,
  };
}
