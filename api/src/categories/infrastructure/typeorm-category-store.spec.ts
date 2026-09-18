import { QueryFailedError, type EntityManager } from 'typeorm';
import {
  CategoryNameConflictError,
  CategoryOwnerNotFoundError,
} from '../application/category-errors';
import { TypeOrmCategoryStore } from './typeorm-category-store';

describe('TypeOrmCategoryStore', () => {
  it('carries descriptions and selected colors through create and update persistence operations', async () => {
    const saved = {
      id: '2',
      userId: '1',
      name: 'Dining',
      description: 'Restaurants',
      color: 'teal',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const entity = { ...saved };
    const repository = {
      create: jest.fn().mockReturnValue(entity),
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest
        .fn()
        .mockImplementation((value) => Promise.resolve({ ...saved, ...value })),
    };
    const store = new TypeOrmCategoryStore({
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager);

    await expect(
      store.create({
        userId: '1',
        name: 'Dining',
        description: 'Restaurants',
        color: 'teal',
      }),
    ).resolves.toMatchObject({ description: 'Restaurants', color: 'teal' });
    expect(repository.create).toHaveBeenCalledWith({
      userId: '1',
      name: 'Dining',
      description: 'Restaurants',
      color: 'teal',
    });
    await expect(
      store.update('1', '2', { description: null, color: 'forest' }),
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
      store.create({ userId: '1', name: 'Groceries', description: null }),
    ).rejects.toBeInstanceOf(CategoryNameConflictError);
  });

  it('translates a PostgreSQL owner foreign-key violation into a user not-found error', async () => {
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
      store.create({ userId: '404', name: 'Groceries', description: null }),
    ).rejects.toBeInstanceOf(CategoryOwnerNotFoundError);
  });
});
