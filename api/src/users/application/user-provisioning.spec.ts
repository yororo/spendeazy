import type {
  ClerkProfileService,
  ClerkUserProfile,
} from '../../authentication/clerk-profile-service';
import type { DefaultCategoryProvisioner } from '../../categories/application/default-categories.service';
import type { PersonalSpaceProvisioner } from '../../spaces/application/space-store';
import type { NewUser, UpdateUser, UserRecord, UserStore } from './user-store';
import {
  UserEmailConflictError,
  UserNotFoundError,
  UserProfileEmailRequiredError,
} from './user-errors';
import { UsersService } from './users.service';

describe('UsersService provisioning', () => {
  it('creates a local User from the verified Clerk identity and profile', async () => {
    const profileService = new ClerkProfileServiceFake({
      fullName: 'Ada Lovelace',
      primaryVerifiedEmail: ' ADA@Example.COM ',
    });
    const store = new UserStoreFake();
    const defaultCategories = new DefaultCategoryProvisionerFake();
    const personalSpaces = new PersonalSpaceProvisionerFake();
    const service = new UsersService(
      store,
      profileService,
      defaultCategories,
      personalSpaces,
    );

    const result = await service.provisionUser('user_42');

    expect(result.created).toBe(true);
    expect(result.user).toMatchObject({ id: '2', clerkUserId: 'user_42' });
    expect(profileService.requestedClerkUserIds).toEqual(['user_42']);
    expect(store.createdInput).toEqual({
      clerkUserId: 'user_42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(defaultCategories.requestedUserIds).toEqual(['2']);
    expect(personalSpaces.requestedUserIds).toEqual(['2']);
  });

  it('synchronizes an existing User found by Clerk subject and is idempotent', async () => {
    const current = userRecord({
      clerkUserId: 'user_42',
      name: 'Old Name',
      email: 'old@example.com',
    });
    const updated = userRecord({
      ...current,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    const profileService = new ClerkProfileServiceFake({
      fullName: 'Ada Lovelace',
      primaryVerifiedEmail: 'ADA@example.com',
    });
    const store = new UserStoreFake({
      users: [current],
      updatedUser: updated,
    });
    const defaultCategories = new DefaultCategoryProvisionerFake();
    const service = new UsersService(store, profileService, defaultCategories);

    await expect(service.provisionUser('user_42')).resolves.toEqual({
      created: false,
      user: updated,
    });
    expect(store.updatedInput).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });

    store.updatedInput = undefined;
    profileService.profile = {
      fullName: updated.name,
      primaryVerifiedEmail: updated.email,
    };
    await expect(service.provisionUser('user_42')).resolves.toEqual({
      created: false,
      user: updated,
    });
    expect(store.updatedInput).toBeUndefined();
    expect(defaultCategories.requestedUserIds).toEqual([]);
  });

  it('does not link an unprovisioned Clerk subject to an email-owned User', async () => {
    const existing = userRecord({
      clerkUserId: 'different_clerk_user',
      email: 'ada@example.com',
    });
    const store = new UserStoreFake({ users: [existing] });
    const service = new UsersService(
      store,
      new ClerkProfileServiceFake({
        fullName: 'Ada Lovelace',
        primaryVerifiedEmail: existing.email,
      }),
      new DefaultCategoryProvisionerFake(),
    );

    await expect(
      service.provisionUser('new_clerk_user'),
    ).rejects.toBeInstanceOf(UserEmailConflictError);
    expect(store.createdInput).toBeUndefined();
  });

  it('treats a same-subject create race as an idempotent retry', async () => {
    const racedUser = userRecord({
      clerkUserId: 'user_42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    const store = new UserStoreFake({ createRaceUser: racedUser });
    const service = new UsersService(
      store,
      new ClerkProfileServiceFake({
        fullName: racedUser.name,
        primaryVerifiedEmail: racedUser.email,
      }),
      new DefaultCategoryProvisionerFake(),
    );

    await expect(service.provisionUser('user_42')).resolves.toEqual({
      created: false,
      user: racedUser,
    });
  });

  it('rejects a profile without a primary verified email', async () => {
    const store = new UserStoreFake();
    const service = new UsersService(
      store,
      new ClerkProfileServiceFake({
        fullName: 'Ada Lovelace',
        primaryVerifiedEmail: null,
      }),
      new DefaultCategoryProvisionerFake(),
    );

    await expect(service.provisionUser('user_42')).rejects.toBeInstanceOf(
      UserProfileEmailRequiredError,
    );
    expect(store.createdInput).toBeUndefined();
  });

  it('uses a deterministic fallback when Clerk has no full name', async () => {
    const store = new UserStoreFake();
    const service = new UsersService(
      store,
      new ClerkProfileServiceFake({
        fullName: null,
        primaryVerifiedEmail: 'ada@example.com',
      }),
      new DefaultCategoryProvisionerFake(),
    );

    await expect(service.provisionUser('user_42')).resolves.toMatchObject({
      created: true,
      user: { name: 'Spendeazy User' },
    });
  });

  it('returns a not-found error when Clerk no longer has the profile', async () => {
    const service = new UsersService(
      new UserStoreFake(),
      new ClerkProfileServiceFake(null),
      new DefaultCategoryProvisionerFake(),
    );

    await expect(service.provisionUser('deleted_user')).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('hides temporary Clerk profile failures behind a service-unavailable error', async () => {
    const service = new UsersService(
      new UserStoreFake(),
      new ClerkProfileServiceFake(new Error('provider details')),
      new DefaultCategoryProvisionerFake(),
    );

    await expect(service.provisionUser('user_42')).rejects.toThrow(
      'The identity provider is temporarily unavailable',
    );
  });
});

class DefaultCategoryProvisionerFake implements DefaultCategoryProvisioner {
  readonly requestedUserIds: string[] = [];

  createForNewUser(userId: string): Promise<void> {
    this.requestedUserIds.push(userId);
    return Promise.resolve();
  }
}

class PersonalSpaceProvisionerFake implements PersonalSpaceProvisioner {
  readonly requestedUserIds: string[] = [];

  ensurePersonalSpace(userId: string): Promise<void> {
    this.requestedUserIds.push(userId);
    return Promise.resolve();
  }
}

class ClerkProfileServiceFake implements ClerkProfileService {
  readonly requestedClerkUserIds: string[] = [];
  profile: ClerkUserProfile | null;

  constructor(profile: ClerkUserProfile | null | Error) {
    this.profile = profile instanceof Error ? null : profile;
    this.error = profile instanceof Error ? profile : undefined;
  }

  private readonly error: Error | undefined;

  getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
    this.requestedClerkUserIds.push(clerkUserId);
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve(this.profile);
  }
}

class UserStoreFake implements UserStore {
  createdInput: NewUser | undefined;
  createdUser: UserRecord | undefined;
  updatedInput: UpdateUser | undefined;

  private readonly users: UserRecord[];
  private readonly updatedUser: UserRecord | undefined;
  private readonly createRaceUser: UserRecord | undefined;

  constructor(
    options: {
      users?: UserRecord[];
      updatedUser?: UserRecord;
      createRaceUser?: UserRecord;
    } = {},
  ) {
    this.users = options.users ?? [];
    this.updatedUser = options.updatedUser;
    this.createRaceUser = options.createRaceUser;
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  findByClerkUserId(clerkUserId: string): Promise<UserRecord | null> {
    return Promise.resolve(
      this.users.find((user) => user.clerkUserId === clerkUserId) ?? null,
    );
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(
      this.users.find((user) => user.email === email) ?? null,
    );
  }

  create(input: NewUser): Promise<UserRecord> {
    this.createdInput = input;
    if (this.createRaceUser) {
      this.users.push(this.createRaceUser);
      return Promise.reject(new UserEmailConflictError());
    }

    this.createdUser = userRecord({ ...input, id: '2' });
    return Promise.resolve(this.createdUser);
  }

  update(id: string, input: UpdateUser): Promise<UserRecord | null> {
    this.updatedInput = input;
    const updated =
      this.updatedUser ??
      userRecord({
        ...this.users.find((user) => user.id === id),
        ...input,
        id,
      });
    const index = this.users.findIndex((user) => user.id === id);
    if (index >= 0) this.users[index] = updated;
    return Promise.resolve(updated);
  }
}

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    clerkUserId: 'user_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
