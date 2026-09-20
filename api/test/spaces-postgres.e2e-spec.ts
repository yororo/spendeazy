import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

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
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('associates legacy-shaped financial writes with one private Personal Space without changing record identities', async () => {
    const user = await createUser('legacy-shaped');
    const category = await database.getRepository(CategoryEntity).save({
      userId: user.id,
      name: 'Legacy category',
      isActive: true,
    });
    const statementImport = await database
      .getRepository(StatementImportEntity)
      .save({
        userId: user.id,
        fileName: 'legacy.pdf',
        fileHash: uniqueHash('legacy-file'),
        statementDate: '2026-09-20',
        bank: 'Legacy Bank',
        cardType: null,
      });
    const transaction = await database.getRepository(TransactionEntity).save({
      userId: user.id,
      categoryId: category.id,
      statementImportId: statementImport.id,
      purchaseDate: '2026-09-20',
      description: 'Legacy transaction',
      amount: '12.34',
      categoryMatchConfidence: null,
      importFingerprint: uniqueHash('legacy-transaction'),
    });
    const rule = await database.getRepository(CategoryRuleEntity).save({
      userId: user.id,
      categoryId: category.id,
      pattern: 'Legacy',
      normalizedPattern: 'legacy',
      matchType: 'exact',
    });

    const spaces = await database.getRepository(SpaceEntity).findBy({
      personalOwnerUserId: user.id,
    });
    const memberships = await database
      .getRepository(SpaceMembershipEntity)
      .findBy({ userId: user.id });
    const persistedCategory = await database
      .getRepository(CategoryEntity)
      .findOneByOrFail({ id: category.id });
    const persistedImport = await database
      .getRepository(StatementImportEntity)
      .findOneByOrFail({ id: statementImport.id });
    const persistedTransaction = await database
      .getRepository(TransactionEntity)
      .findOneByOrFail({ id: transaction.id });
    const persistedRule = await database
      .getRepository(CategoryRuleEntity)
      .findOneByOrFail({ id: rule.id });

    expect(spaces).toHaveLength(1);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      spaceId: spaces[0].id,
      userId: user.id,
      accessLevel: 'write',
    });
    expect(persistedCategory).toMatchObject({
      id: category.id,
      userId: user.id,
      spaceId: spaces[0].id,
    });
    expect(persistedImport).toMatchObject({
      id: statementImport.id,
      userId: user.id,
      spaceId: spaces[0].id,
      importedByUserId: user.id,
    });
    expect(persistedTransaction).toMatchObject({
      id: transaction.id,
      userId: user.id,
      categoryId: category.id,
      statementImportId: statementImport.id,
      spaceId: spaces[0].id,
      addedByUserId: user.id,
    });
    expect(persistedRule).toMatchObject({
      id: rule.id,
      userId: user.id,
      categoryId: category.id,
      spaceId: spaces[0].id,
    });
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
      .findBy({ userId: first.user.id });

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
    await database.getRepository(TransactionEntity).delete({ userId });
    await database.getRepository(CategoryRuleEntity).delete({ userId });
    await database.getRepository(StatementImportEntity).delete({ userId });
    const categoryIds = await database
      .getRepository(CategoryEntity)
      .findBy({ userId });
    if (categoryIds.length > 0) {
      await database
        .getRepository(CategoryEntity)
        .delete(categoryIds.map((category) => category.id));
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

function uniqueHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
