import { QueryFailedError, type EntityManager } from 'typeorm';
import { CategoryNotFoundError } from '../../categories/application/category-errors';
import { CategoryEntity } from '../../database/entities/category.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { CategoryRulePatternConflictError } from '../application/category-rule-errors';
import { TypeOrmCategoryRuleStore } from './typeorm-category-rule-store';

describe('TypeOrmCategoryRuleStore', () => {
  it('translates a PostgreSQL unique violation into the stable pattern conflict', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue({}),
      save: jest
        .fn()
        .mockRejectedValue(new QueryFailedError('INSERT', [], driverError)),
    };
    const entityManager = entityManagerFor(repository);
    const store = new TypeOrmCategoryRuleStore(entityManager);

    await expect(
      store.createInSpace({
        spaceId: '1',
        categoryId: '10',
        pattern: 'Groceries',
        normalizedPattern: 'groceries',
      }),
    ).rejects.toBeInstanceOf(CategoryRulePatternConflictError);
  });

  it('translates a category foreign-key violation into a category not-found error', async () => {
    const driverError = Object.assign(new Error('foreign key violation'), {
      code: '23503',
      constraint: 'fk_category_rules_category_space',
    });
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue({}),
      save: jest
        .fn()
        .mockRejectedValue(new QueryFailedError('INSERT', [], driverError)),
    };
    const entityManager = entityManagerFor(repository);
    const store = new TypeOrmCategoryRuleStore(entityManager);

    await expect(
      store.createInSpace({
        spaceId: '1',
        categoryId: '404',
        pattern: 'Groceries',
        normalizedPattern: 'groceries',
      }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

function entityManagerFor(repository: object): EntityManager {
  const categoryRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: '10',
        spaceId: '1',
        isActive: true,
      }),
    }),
  };
  const transactionalManager = {
    getRepository: jest.fn((entity: typeof CategoryEntity) =>
      entity === CategoryEntity || entity === SpaceEntity
        ? categoryRepository
        : repository,
    ),
  } as unknown as EntityManager;

  return {
    transaction: jest.fn((work: (manager: EntityManager) => unknown) =>
      work(transactionalManager),
    ),
  } as unknown as EntityManager;
}
