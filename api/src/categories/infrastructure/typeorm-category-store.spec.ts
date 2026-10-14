import { QueryFailedError, type EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { SpaceEntity } from '../../database/entities/space.entity';
import { SpaceNotFoundError } from '../../spaces/application/space-errors';
import { CategoryNameConflictError } from '../application/category-errors';
import { TypeOrmCategoryStore } from './typeorm-category-store';

describe('TypeOrmCategoryStore', () => {
  it('carries descriptions and selected colors through create and update persistence operations', async () => {
    const saved = {
      id: '2',
      spaceId: '1',
      name: 'Dining',
      description: 'Restaurants',
      color: 'teal',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const entity = { ...saved };
    const updatedEntity = { ...entity, description: null, color: 'forest' };
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const repository = {
      create: jest.fn().mockReturnValue(entity),
      findOne: jest.fn().mockResolvedValue(updatedEntity),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest
        .fn()
        .mockImplementation((value) => Promise.resolve({ ...saved, ...value })),
    };
    const store = new TypeOrmCategoryStore({
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager);

    await expect(
      store.create({
        spaceId: '1',
        name: 'Dining',
        description: 'Restaurants',
        color: 'teal',
      }),
    ).resolves.toMatchObject({ description: 'Restaurants', color: 'teal' });
    expect(repository.create).toHaveBeenCalledWith({
      spaceId: '1',
      name: 'Dining',
      description: 'Restaurants',
      color: 'teal',
    });
    await expect(
      store.updateInSpace('1', '2', {
        description: null,
        color: 'forest',
        expectedUpdatedAt: saved.updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ description: null, color: 'forest' });
  });

  it('translates a PostgreSQL unique violation into the stable name conflict', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const repository = {
      create: jest.fn().mockReturnValue({}),
      save: jest
        .fn()
        .mockRejectedValue(new QueryFailedError('INSERT', [], driverError)),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmCategoryStore(entityManager);

    await expect(
      store.create({ spaceId: '1', name: 'Groceries', description: null }),
    ).rejects.toBeInstanceOf(CategoryNameConflictError);
  });

  it('translates a PostgreSQL Space foreign-key violation into a Space not-found error', async () => {
    const driverError = Object.assign(new Error('foreign key violation'), {
      code: '23503',
    });
    const repository = {
      create: jest.fn().mockReturnValue({}),
      save: jest
        .fn()
        .mockRejectedValue(new QueryFailedError('INSERT', [], driverError)),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmCategoryStore(entityManager);

    await expect(
      store.create({ spaceId: '404', name: 'Groceries', description: null }),
    ).rejects.toBeInstanceOf(SpaceNotFoundError);
  });

  it('locks the destination Space before changing Category eligibility', async () => {
    const category = {
      id: '2',
      spaceId: '1',
      name: 'Dining',
      description: null,
      color: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const categoryQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const categoryRepository = {
      findOne: jest.fn().mockResolvedValue({ ...category, isActive: false }),
      createQueryBuilder: jest.fn().mockReturnValue(categoryQueryBuilder),
      save: jest
        .fn()
        .mockImplementation((value) =>
          Promise.resolve({ ...category, ...value }),
        ),
    };
    const spaceQuery = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: '1' }),
    };
    const getRepository = jest.fn((entity: unknown) =>
      entity === SpaceEntity
        ? { createQueryBuilder: () => spaceQuery }
        : categoryRepository,
    );
    const transactionManager = {
      getRepository,
    } as unknown as EntityManager;
    const transaction = jest.fn(
      async (work: (manager: EntityManager) => Promise<unknown>) =>
        work(transactionManager),
    );
    const entityManager = {
      transaction,
    } as unknown as EntityManager;
    const store = new TypeOrmCategoryStore(entityManager);

    await expect(
      store.updateInSpace('1', '2', {
        isActive: false,
        expectedUpdatedAt: category.updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ isActive: false });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledWith(SpaceEntity);
    expect(spaceQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(getRepository).toHaveBeenCalledWith(CategoryEntity);
  });
});
