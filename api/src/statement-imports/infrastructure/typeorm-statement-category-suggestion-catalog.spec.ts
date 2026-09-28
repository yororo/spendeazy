import type { EntityManager, Repository } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { TypeOrmStatementCategorySuggestionCatalog } from './typeorm-statement-category-suggestion-catalog';

describe('TypeOrmStatementCategorySuggestionCatalog', () => {
  it('returns active destination Categories with bounded current-Category examples', async () => {
    const categories = [categoryEntity()];
    const find = jest.fn().mockResolvedValue(categories);
    const categoryRepository = {
      find,
    } as unknown as Repository<CategoryEntity>;
    const examples = [{ categoryId: '42', description: 'Metro Market North' }];
    const getRawMany = jest.fn().mockResolvedValue(examples);
    const queryBuilder = {
      distinctOn: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany,
    };
    const transactionRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<TransactionEntity>;
    const getRepository = jest
      .fn()
      .mockReturnValueOnce(categoryRepository)
      .mockReturnValueOnce(transactionRepository);
    const entityManager = {
      getRepository,
    } as unknown as EntityManager;
    const catalog = new TypeOrmStatementCategorySuggestionCatalog(
      entityManager,
    );

    await expect(catalog.findSuggestionCatalogInSpace('7')).resolves.toEqual({
      categories: [
        {
          id: '42',
          name: 'Groceries',
          description: 'Food and household supplies',
        },
      ],
      examples,
    });

    expect(getRepository).toHaveBeenNthCalledWith(1, CategoryEntity);
    expect(getRepository).toHaveBeenNthCalledWith(2, TransactionEntity);
    expect(find).toHaveBeenCalledWith({
      select: { id: true, name: true, description: true },
      where: { spaceId: '7', isActive: true },
      order: { id: 'ASC' },
      take: 255,
    });
    expect(queryBuilder.distinctOn).toHaveBeenCalledWith([
      'transaction.categoryId',
    ]);
    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      CategoryEntity,
      'category',
      'category.id = transaction.categoryId AND category.spaceId = transaction.spaceId AND category.isActive = :isActive',
      { isActive: true },
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'transaction.spaceId = :spaceId',
      { spaceId: '7' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'transaction.deletedAt IS NULL',
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'transaction.categoryId',
      'ASC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'transaction.purchaseDate',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      2,
      'transaction.id',
      'DESC',
    );
    expect(queryBuilder.limit).toHaveBeenCalledWith(1);
  });

  it('revalidates that a selected Category remains active in the same Space', async () => {
    const findOne = jest.fn().mockResolvedValue(categoryEntity());
    const repository = {
      findOne,
    } as unknown as Repository<CategoryEntity>;
    const getRepository = jest.fn().mockReturnValue(repository);
    const entityManager = {
      getRepository,
    } as unknown as EntityManager;
    const catalog = new TypeOrmStatementCategorySuggestionCatalog(
      entityManager,
    );

    await expect(catalog.findActiveCategoryInSpace('7', '42')).resolves.toEqual(
      {
        id: '42',
        name: 'Groceries',
        description: 'Food and household supplies',
      },
    );
    expect(findOne).toHaveBeenCalledWith({
      select: { id: true, name: true, description: true },
      where: { id: '42', spaceId: '7', isActive: true },
    });
  });
});

function categoryEntity(): CategoryEntity {
  return {
    id: '42',
    spaceId: '7',
    name: 'Groceries',
    description: 'Food and household supplies',
    color: 'forest',
    isActive: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}
