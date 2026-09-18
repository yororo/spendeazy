import { QueryFailedError, type EntityManager } from 'typeorm';
import { UserEmailConflictError } from '../application/user-errors';
import { TypeOrmUserStore } from './typeorm-user-store';

describe('TypeOrmUserStore', () => {
  it('translates a PostgreSQL unique violation into the stable email conflict', async () => {
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
    const store = new TypeOrmUserStore(entityManager);

    await expect(
      store.create({
        clerkUserId: 'user_42',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }),
    ).rejects.toBeInstanceOf(UserEmailConflictError);
  });
});
