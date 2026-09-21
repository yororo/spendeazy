import { randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { TypeOrmCategoryStore } from '../src/categories/infrastructure/typeorm-category-store';
import { DefaultCategoriesService } from '../src/categories/application/default-categories.service';
import { DEFAULT_CATEGORY_CATALOG } from '../src/categories/application/default-category-catalog';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import { TransactionsService } from '../src/transactions/application/transactions.service';
import { TypeOrmTransactionCategoryStore } from '../src/transactions/infrastructure/typeorm-transaction-category-store';
import { TypeOrmTransactionStore } from '../src/transactions/infrastructure/typeorm-transaction-store';
import { TypeOrmUserStore } from '../src/users/infrastructure/typeorm-user-store';
import { UsersService } from '../src/users/application/users.service';
import type {
  ClerkProfileService,
  ClerkUserProfile,
} from '../src/authentication/clerk-profile-service';

const databaseUrl = process.env.TEST_SPACES_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('Spaces with PostgreSQL', () => {
  let database: DataSource;
  const createdUserIds: string[] = [];
  const createdSharedSpaceIds: string[] = [];

  beforeAll(async () => {
    database = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: DATABASE_ENTITIES,
      migrations: DATABASE_MIGRATIONS,
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
    }).initialize();
    await database.runMigrations();
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await deleteUserData(userId);
    }
    for (const spaceId of createdSharedSpaceIds.splice(0)) {
      await database.getRepository(SpaceEntity).delete({ id: spaceId });
    }
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('provisions one idempotent Personal Space and default Categories for a new User', async () => {
    const unique = randomUUID();
    const profileService = new FixedProfileService({
      fullName: 'New Space User',
      primaryVerifiedEmail: `${unique}@example.test`,
    });
    const categories = new DefaultCategoriesService(
      new TypeOrmCategoryStore(database.manager),
      { report: jest.fn() },
    );
    const service = new UsersService(
      new TypeOrmUserStore(database.manager),
      profileService,
      categories,
      new TypeOrmSpaceStore(database.manager),
    );

    const first = await service.provisionUser(`clerk_${unique}`);
    createdUserIds.push(first.user.id);
    const second = await service.provisionUser(`clerk_${unique}`);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        new TypeOrmSpaceStore(database.manager).ensurePersonalSpace(
          first.user.id,
        ),
      ),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    const spaces = await database.getRepository(SpaceEntity).findBy({
      personalOwnerUserId: first.user.id,
    });
    const persistedCategories = await database
      .getRepository(CategoryEntity)
      .findBy({ spaceId: spaces[0].id });

    expect(spaces).toHaveLength(1);
    expect(persistedCategories).toHaveLength(DEFAULT_CATEGORY_CATALOG.length);
    expect(
      new Set(persistedCategories.map((category) => category.spaceId)),
    ).toEqual(new Set([spaces[0].id]));
  });

  it('does not grant a different User read access to a Personal Space', async () => {
    const owner = await createUser('space-owner');
    const other = await createUser('space-other');
    const store = new TypeOrmSpaceStore(database.manager);
    const access = new SpaceAccessService(store);
    await store.ensurePersonalSpace(owner.id);
    const [space] = await database.getRepository(SpaceEntity).findBy({
      personalOwnerUserId: owner.id,
    });

    await expect(
      access.requireReadAccess(owner.id, space.id),
    ).resolves.toMatchObject({
      id: space.id,
      userId: owner.id,
      accessLevel: 'write',
    });
    await expect(
      access.requireReadAccess(other.id, space.id),
    ).rejects.toMatchObject({
      code: 'SPACE_NOT_FOUND',
    });
  });

  it('keeps shared Transaction ownership, same-Space Categories, and stale writes isolated', async () => {
    const owner = await createUser('transaction-space-owner');
    const member = await createUser('transaction-space-member');
    const outsider = await createUser('transaction-space-outsider');
    const spaceStore = new TypeOrmSpaceStore(database.manager);
    const ownerPersonalSpaceId = await spaceStore.ensurePersonalSpace(owner.id);
    const memberPersonalSpaceId = await spaceStore.ensurePersonalSpace(
      member.id,
    );
    const sharedSpace = await database.getRepository(SpaceEntity).save({
      kind: 'shared',
      status: 'active',
      personalOwnerUserId: null,
    });
    createdSharedSpaceIds.push(sharedSpace.id);
    await database.getRepository(SpaceMembershipEntity).save([
      {
        spaceId: sharedSpace.id,
        userId: owner.id,
        accessLevel: 'write',
      },
      {
        spaceId: sharedSpace.id,
        userId: member.id,
        accessLevel: 'write',
      },
    ]);

    const sharedCategory = await database.getRepository(CategoryEntity).save({
      spaceId: sharedSpace.id,
      name: 'Shared meals',
      isActive: true,
    });
    const ownerPersonalCategory = await database
      .getRepository(CategoryEntity)
      .save({
        spaceId: ownerPersonalSpaceId,
        name: 'Private meals',
        isActive: true,
      });
    const access = new SpaceAccessService(spaceStore);

    await expect(
      access.requireWriteAccess(owner.id, sharedSpace.id),
    ).resolves.toMatchObject({ accessLevel: 'write' });
    await expect(
      access.requireWriteAccess(member.id, sharedSpace.id),
    ).resolves.toMatchObject({ accessLevel: 'write' });
    await expect(
      access.requireReadAccess(member.id, ownerPersonalSpaceId),
    ).rejects.toMatchObject({ code: 'SPACE_NOT_FOUND' });
    await expect(
      access.requireReadAccess(owner.id, memberPersonalSpaceId),
    ).rejects.toMatchObject({ code: 'SPACE_NOT_FOUND' });
    await expect(
      access.requireReadAccess(outsider.id, sharedSpace.id),
    ).rejects.toMatchObject({ code: 'SPACE_NOT_FOUND' });

    const transactionStore = new TypeOrmTransactionStore(database.manager);
    const transactions = new TransactionsService(
      new TypeOrmTransactionCategoryStore(database.manager),
      transactionStore,
      undefined,
    );
    const created = await transactions.createManualTransactionInSpace(
      member.id,
      sharedSpace.id,
      {
        categoryId: sharedCategory.id,
        purchaseDate: '2026-09-20',
        description: 'Shared dinner',
        amount: '24.50',
      },
    );

    expect(created).toMatchObject({
      spaceId: sharedSpace.id,
      addedByUserId: member.id,
    });
    await expect(
      transactions.createManualTransactionInSpace(owner.id, sharedSpace.id, {
        categoryId: ownerPersonalCategory.id,
        purchaseDate: '2026-09-20',
        description: 'Private Category rejected',
        amount: '1.00',
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });

    await expect(
      transactions.listTransactionsInSpace(sharedSpace.id, {}),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: created.id })],
      nextCursor: null,
    });

    const updated = await transactions.updateManualTransactionInSpace(
      sharedSpace.id,
      created.id,
      {
        description: 'Shared dinner updated',
        expectedUpdatedAt: created.updatedAt.toISOString(),
      },
    );
    expect(updated).toMatchObject({
      description: 'Shared dinner updated',
      addedByUserId: member.id,
    });
    await expect(
      transactions.updateManualTransactionInSpace(sharedSpace.id, created.id, {
        description: 'Stale edit',
        expectedUpdatedAt: created.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'STALE_EDIT' });

    await expect(
      transactions.deleteManualTransactionInSpace(
        sharedSpace.id,
        created.id,
        updated.updatedAt.toISOString(),
      ),
    ).resolves.toBeUndefined();
    await expect(
      database.getRepository(TransactionEntity).findOneBy({ id: created.id }),
    ).resolves.toBeNull();
  });

  async function createUser(label: string): Promise<UserEntity> {
    const unique = randomUUID();
    const user = await database.getRepository(UserEntity).save({
      clerkUserId: `${label}_${unique}`,
      name: label,
      email: `${unique}@example.test`,
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function deleteUserData(userId: string): Promise<void> {
    const memberships = await database
      .getRepository(SpaceMembershipEntity)
      .findBy({ userId });
    const spaceIds = memberships.map((membership) => membership.spaceId);
    if (spaceIds.length > 0) {
      await database.getRepository(TransactionEntity).delete({
        spaceId: In(spaceIds),
      });
      await database.getRepository(CategoryRuleEntity).delete({
        spaceId: In(spaceIds),
      });
      await database.getRepository(StatementImportEntity).delete({
        spaceId: In(spaceIds),
      });
      await database.getRepository(CategoryEntity).delete({
        spaceId: In(spaceIds),
      });
    }
    await database.getRepository(UserEntity).delete({ id: userId });
  }
});

class FixedProfileService implements ClerkProfileService {
  constructor(private readonly profile: ClerkUserProfile) {}

  getUserProfile(): Promise<ClerkUserProfile> {
    return Promise.resolve(this.profile);
  }
}
