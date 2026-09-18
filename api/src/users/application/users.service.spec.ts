import type { ClerkProfileService } from '../../authentication/clerk-profile-service';
import { UserNotFoundError } from './user-errors';
import type { UserStore } from './user-store';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('resolves a provisioned User by its trusted internal ID', async () => {
    const user = {
      id: '42',
      clerkUserId: 'user_42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: new Date('2026-08-29T00:00:00.000Z'),
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    };
    const store = {
      findById: jest.fn().mockResolvedValue(user),
    };
    const service = new UsersService(
      store as unknown as UserStore,
      {} as ClerkProfileService,
    );

    await expect(service.getUserById('42')).resolves.toEqual(user);
    expect(store.findById).toHaveBeenCalledWith('42');
  });

  it('returns a stable not-found error for an absent Clerk subject', async () => {
    const store = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const service = new UsersService(
      store as unknown as UserStore,
      {} as ClerkProfileService,
    );

    await expect(service.getUserById('missing_user')).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});
