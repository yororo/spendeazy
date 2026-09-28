import type { EntityManager, Repository } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TypeOrmStatementCategorySuggestionCatalog } from './typeorm-statement-category-suggestion-catalog';

describe('TypeOrmStatementCategorySuggestionCatalog', () => {
  it('reads only active Categories from the destination Space with bounded context', async () => {
    const categories = [categoryEntity()];
    const find = jest.fn().mockResolvedValue(categories);
    const repository = {
      find,
    } as unknown as Repository<CategoryEntity>;
    const getRepository = jest.fn().mockReturnValue(repository);
    const entityManager = {
      getRepository,
    } as unknown as EntityManager;
    const catalog = new TypeOrmStatementCategorySuggestionCatalog(
      entityManager,
    );

    await expect(catalog.findActiveCategoriesInSpace('7')).resolves.toEqual([
      {
        id: '42',
        name: 'Groceries',
        description: 'Food and household supplies',
      },
    ]);

    expect(getRepository).toHaveBeenCalledWith(CategoryEntity);
    expect(find).toHaveBeenCalledWith({
      select: { id: true, name: true, description: true },
      where: { spaceId: '7', isActive: true },
      order: { id: 'ASC' },
      take: 255,
    });
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
