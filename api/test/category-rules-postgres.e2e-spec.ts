import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { UserEntity } from '../src/database/entities/user.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { TypeOrmCategoryRuleStore } from '../src/category-rules/infrastructure/typeorm-category-rule-store';
import { TypeOrmCategoryRuleCategoryStore } from '../src/category-rules/infrastructure/typeorm-category-rule-category-store';
import { CategoryRulesService } from '../src/category-rules/application/category-rules.service';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';
import { SpaceNotFoundError } from '../src/spaces/application/space-errors';

const databaseUrl = process.env.TEST_CATEGORY_RULES_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('category rules with PostgreSQL', () => {
  let database: DataSource;
  let userId: string;

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

  beforeEach(async () => {
    const unique = randomUUID();
    const user = await database.getRepository(UserEntity).save({
      clerkUserId: unique,
      name: 'Rule test',
      email: `${unique}@example.test`,
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('shares rules by Space, rejects stale replacements, and excludes an unrelated User', async () => {
    const unique = randomUUID();
    const member = await database.getRepository(UserEntity).save({
      clerkUserId: unique,
      name: 'Shared member',
      email: `${unique}@example.test`,
    });
    const outsiderUnique = randomUUID();
    const outsider = await database.getRepository(UserEntity).save({
      clerkUserId: outsiderUnique,
      name: 'Unrelated user',
      email: `${outsiderUnique}@example.test`,
    });
    const space = await database.getRepository(SpaceEntity).save({
      kind: 'shared',
      status: 'active',
      personalOwnerUserId: null,
    });
    await database.getRepository(SpaceMembershipEntity).save([
      { spaceId: space.id, userId, accessLevel: 'write' },
      { spaceId: space.id, userId: member.id, accessLevel: 'write' },
    ]);
    const sharedCategories = await database.getRepository(CategoryEntity).save([
      { spaceId: space.id, name: 'Shared Housing', isActive: true },
      { spaceId: space.id, name: 'Shared Bills', isActive: true },
    ]);
    const sharedCategoryId = sharedCategories[0].id;
    const otherSharedCategoryId = sharedCategories[1].id;
    const scopedService = new CategoryRulesService(
      new TypeOrmCategoryRuleStore(database.manager),
      new TypeOrmCategoryRuleCategoryStore(database.manager),
    );
    const access = new SpaceAccessService(
      new TypeOrmSpaceStore(database.manager),
    );

    await expect(
      access.requireReadAccess(member.id, space.id),
    ).resolves.toMatchObject({
      id: space.id,
      accessLevel: 'write',
    });
    await expect(
      access.requireReadAccess(outsider.id, space.id),
    ).rejects.toBeInstanceOf(SpaceNotFoundError);

    const initial = await scopedService.listCategoryRulesInSpace(space.id);
    expect(initial).toMatchObject({ rules: [], revision: '0' });
    const created = await scopedService.createCategoryRuleInSpace(space.id, {
      categoryId: sharedCategoryId,
      pattern: 'RENT',
    });
    expect(created).toMatchObject({
      spaceId: space.id,
      categoryId: sharedCategoryId,
    });
    await expect(
      scopedService.createCategoryRuleInSpace(space.id, {
        categoryId: otherSharedCategoryId,
        pattern: ' rent ',
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS' });

    const memberView = await scopedService.listCategoryRulesInSpace(space.id);
    expect(memberView.rules).toEqual([created]);
    await scopedService.replaceCategoryRulesInSpace(
      space.id,
      sharedCategoryId,
      [{ pattern: 'RENT PAYMENT', matchType: 'exact' }],
      memberView.revision,
    );
    await expect(
      scopedService.replaceCategoryRulesInSpace(
        space.id,
        sharedCategoryId,
        [{ pattern: 'STALE', matchType: 'contains' }],
        memberView.revision,
      ),
    ).rejects.toMatchObject({ code: 'STALE_EDIT' });
    await expect(
      scopedService.listCategoryRulesInSpace(space.id),
    ).resolves.toMatchObject({
      rules: [expect.objectContaining({ pattern: 'RENT PAYMENT' })],
      revision: '2',
    });
  });

  it('serializes concurrent Space replacements and rejects the stale member', async () => {
    const space = await database.getRepository(SpaceEntity).save({
      kind: 'shared',
      status: 'active',
      personalOwnerUserId: null,
    });
    const memberUnique = randomUUID();
    const member = await database.getRepository(UserEntity).save({
      clerkUserId: memberUnique,
      name: 'Concurrent member',
      email: `${memberUnique}@example.test`,
    });
    await database.getRepository(SpaceMembershipEntity).save([
      { spaceId: space.id, userId, accessLevel: 'write' },
      { spaceId: space.id, userId: member.id, accessLevel: 'write' },
    ]);
    const [category] = await database
      .getRepository(CategoryEntity)
      .save([{ spaceId: space.id, name: 'Concurrent', isActive: true }]);
    const scopedService = new CategoryRulesService(
      new TypeOrmCategoryRuleStore(database.manager),
      new TypeOrmCategoryRuleCategoryStore(database.manager),
    );
    const { revision } = await scopedService.listCategoryRulesInSpace(space.id);

    const results = await Promise.allSettled([
      scopedService.replaceCategoryRulesInSpace(
        space.id,
        category.id,
        [{ pattern: 'OWNER', matchType: 'exact' }],
        revision,
      ),
      scopedService.replaceCategoryRulesInSpace(
        space.id,
        category.id,
        [{ pattern: 'MEMBER', matchType: 'contains' }],
        revision,
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results.filter(hasStaleEditCode)).toHaveLength(1);
    expect(
      (await scopedService.listCategoryRulesInSpace(space.id)).rules,
    ).toHaveLength(1);
  });
});

function hasStaleEditCode(result: PromiseSettledResult<unknown>): boolean {
  if (result.status !== 'rejected') return false;

  const reason: unknown = result.reason;
  return (
    typeof reason === 'object' &&
    reason !== null &&
    'code' in reason &&
    (reason as { code?: unknown }).code === 'STALE_EDIT'
  );
}
