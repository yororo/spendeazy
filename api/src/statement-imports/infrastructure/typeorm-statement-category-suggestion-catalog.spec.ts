import type { EntityManager, Repository } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TypeOrmStatementCategorySuggestionCatalog } from './typeorm-statement-category-suggestion-catalog';

describe('TypeOrmStatementCategorySuggestionCatalog', () => {
  it('returns active destination Categories with bounded current-Category examples', async () => {
    const categories = [categoryEntity()];
    const find = jest.fn().mockResolvedValue(categories);
    const categoryRepository = {
      find,
    } as unknown as Repository<CategoryEntity>;
    const examples = [{ categoryId: '42', description: 'Metro Market North' }];
    type EntityManagerQuery = EntityManager['query'];
    const query = jest
      .fn<ReturnType<EntityManagerQuery>, Parameters<EntityManagerQuery>>()
      .mockResolvedValue(examples);
    const getRepository = jest.fn().mockReturnValue(categoryRepository);
    const entityManager = {
      getRepository,
      query,
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
    expect(find).toHaveBeenCalledWith({
      select: { id: true, name: true, description: true },
      where: { spaceId: '7', isActive: true },
      order: { id: 'ASC' },
      take: 255,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CROSS JOIN LATERAL'),
      ['7', ['42'], 4],
    );
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('transaction.space_id = category.space_id');
    expect(sql).toContain('category.is_active = TRUE');
    expect(sql).toContain('transaction.deleted_at IS NULL');
    expect(sql).toContain('LIMIT $3');
    expect(sql).toContain('category.id = ANY($2::bigint[])');
    expect(sql).toContain(
      'ORDER BY category.id ASC, history.purchase_date DESC, history.id DESC',
    );
  });

  it('does not query Transaction history when there are no active Categories', async () => {
    const categoryRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<CategoryEntity>;
    const query = jest.fn();
    const catalog = new TypeOrmStatementCategorySuggestionCatalog({
      getRepository: jest.fn().mockReturnValue(categoryRepository),
      query,
    } as unknown as EntityManager);

    await expect(catalog.findSuggestionCatalogInSpace('7')).resolves.toEqual({
      categories: [],
      examples: [],
    });
    expect(query).not.toHaveBeenCalled();
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
