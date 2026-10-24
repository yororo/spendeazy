import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { ExpenseEntity } from '../../database/entities/expense.entity';
import { TypeOrmCategorySummaryStore } from './typeorm-category-summary-store';

describe('TypeOrmCategorySummaryStore', () => {
  it('maps category aggregates for the requested Space and dates', async () => {
    const categoryQuery = queryBuilder([
      {
        categoryId: '2',
        categoryName: 'Groceries',
        categoryIsActive: true,
        totalAmount: '10.10',
        expenseCount: '2',
        budgetAmount: '20.00',
        budgetPeriod: 'monthly',
      },
    ]);
    const categoryRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(categoryQuery),
    };
    const entityManager = {
      getRepository: jest.fn(
        (entity: typeof CategoryEntity | typeof ExpenseEntity) =>
          entity === CategoryEntity ? categoryRepository : categoryRepository,
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
          expenseCount: '2',
          budgetAmount: '20.00',
          budgetPeriod: 'monthly',
        },
      ],
    });

    expect(categoryQuery.where).toHaveBeenCalledWith(
      'category.spaceId = :spaceId',
      { spaceId: '7' },
    );
    expect(categoryQuery.leftJoin).toHaveBeenCalledWith(
      ExpenseEntity,
      'expense',
      expect.stringContaining(
        'expense.expenseDate BETWEEN :fromDate AND :toDate',
      ),
    );
    expect(categoryQuery.leftJoin).toHaveBeenCalledWith(
      ExpenseEntity,
      'expense',
      expect.stringContaining('expense.deletedAt IS NULL'),
    );
    expect(categoryQuery.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      'budget',
      'budget.categoryId = category.id',
    );
  });

  it('returns an empty category list when no Categories are available', async () => {
    const categoryQuery = queryBuilder([]);
    const entityManager = {
      getRepository: jest.fn(
        (entity: typeof CategoryEntity | typeof ExpenseEntity) =>
          entity === CategoryEntity
            ? { createQueryBuilder: jest.fn().mockReturnValue(categoryQuery) }
            : { createQueryBuilder: jest.fn().mockReturnValue(categoryQuery) },
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
