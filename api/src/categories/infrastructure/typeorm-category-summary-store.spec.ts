import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { TypeOrmCategorySummaryStore } from './typeorm-category-summary-store';

describe('TypeOrmCategorySummaryStore', () => {
  it('maps category aggregates and an owned Uncategorized aggregate for the requested dates', async () => {
    const categoryQuery = queryBuilder([
      {
        categoryId: '2',
        categoryName: 'Groceries',
        categoryIsActive: true,
        totalAmount: '10.10',
        transactionCount: '2',
        budgetAmount: '20.00',
        budgetPeriod: 'monthly',
      },
    ]);
    const uncategorizedQuery = queryBuilder([], {
      uncategorizedAmount: '4.50',
      uncategorizedCount: '1',
    });
    const categoryRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(categoryQuery),
    };
    const transactionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(uncategorizedQuery),
    };
    const entityManager = {
      getRepository: jest.fn(
        (entity: typeof CategoryEntity | typeof TransactionEntity) =>
          entity === CategoryEntity
            ? categoryRepository
            : transactionRepository,
      ),
    } as unknown as EntityManager;
    const store = new TypeOrmCategorySummaryStore(entityManager);

    await expect(
      store.findSummary({
        spaceId: '7',
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
      }),
    ).resolves.toEqual({
      categories: [
        {
          categoryId: '2',
          categoryName: 'Groceries',
          categoryIsActive: true,
          totalAmount: '10.10',
          transactionCount: '2',
          budgetAmount: '20.00',
          budgetPeriod: 'monthly',
        },
      ],
      uncategorizedAmount: '4.50',
      uncategorizedCount: '1',
    });

    expect(categoryQuery.where).toHaveBeenCalledWith(
      'category.spaceId = :spaceId',
      { spaceId: '7' },
    );
    expect(categoryQuery.leftJoin).toHaveBeenCalledWith(
      TransactionEntity,
      'transaction',
      expect.stringContaining(
        'transaction.purchaseDate BETWEEN :fromDate AND :toDate',
      ),
    );
    expect(categoryQuery.leftJoin).toHaveBeenCalledWith(
      TransactionEntity,
      'transaction',
      expect.stringContaining('transaction.deletedAt IS NULL'),
    );
    expect(categoryQuery.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      'budget',
      'budget.categoryId = category.id',
    );
    expect(uncategorizedQuery.where).toHaveBeenCalledWith(
      'transaction.spaceId = :spaceId',
      { spaceId: '7' },
    );
    expect(uncategorizedQuery.andWhere).toHaveBeenCalledWith(
      'transaction.deletedAt IS NULL',
    );
    expect(uncategorizedQuery.andWhere).toHaveBeenCalledWith(
      'transaction.purchaseDate BETWEEN :fromDate AND :toDate',
      { fromDate: '2026-08-01', toDate: '2026-08-31' },
    );
  });

  it('returns a zero Uncategorized total when no uncategorized transactions exist', async () => {
    const categoryQuery = queryBuilder([]);
    const uncategorizedQuery = queryBuilder([]);
    const entityManager = {
      getRepository: jest.fn(
        (entity: typeof CategoryEntity | typeof TransactionEntity) =>
          entity === CategoryEntity
            ? { createQueryBuilder: jest.fn().mockReturnValue(categoryQuery) }
            : {
                createQueryBuilder: jest
                  .fn()
                  .mockReturnValue(uncategorizedQuery),
              },
      ),
    } as unknown as EntityManager;
    const store = new TypeOrmCategorySummaryStore(entityManager);

    await expect(
      store.findSummary({
        spaceId: '7',
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
      }),
    ).resolves.toEqual({
      categories: [],
      uncategorizedAmount: '0.00',
      uncategorizedCount: '0',
    });
  });
});

function queryBuilder(
  rows: object[],
  singleRow?: object,
): Record<string, jest.Mock> {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
    getRawOne: jest.fn().mockResolvedValue(singleRow),
  };
}
