import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { UserEntity } from '../src/database/entities/user.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { TypeOrmCategoryRuleStore } from '../src/category-rules/infrastructure/typeorm-category-rule-store';
import { TypeOrmCategoryRuleCategoryStore } from '../src/category-rules/infrastructure/typeorm-category-rule-category-store';
import { CategoryRulesService } from '../src/category-rules/application/category-rules.service';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';
import { SpaceNotFoundError } from '../src/spaces/application/space-errors';
import type { ReplacementCategoryRule } from '../src/category-rules/application/category-rule-store';

const databaseUrl = process.env.TEST_CATEGORY_RULES_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('category rules with PostgreSQL', () => {
  let database: DataSource;
  let service: CategoryRulesService;
  let userId: string;
  let categoryId: string;
  let otherCategoryId: string;

  beforeAll(async () => {
    database = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: DATABASE_ENTITIES,
      migrations: DATABASE_MIGRATIONS,
      synchronize: false,
    }).initialize();
    await database.runMigrations();
    service = new CategoryRulesService(
      new TypeOrmCategoryRuleStore(database.manager),
      new TypeOrmCategoryRuleCategoryStore(database.manager),
    );
  });

  beforeEach(async () => {
    const unique = randomUUID();
    const user = await database.getRepository(UserEntity).save({
      clerkUserId: unique,
      name: 'Rule test',
      email: `${unique}@example.test`,
    });
    userId = user.id;
    const categories = await database.getRepository(CategoryEntity).save([
      { userId, name: 'Housing', isActive: true },
      { userId, name: 'Bills', isActive: true },
    ]);
    categoryId = categories[0].id;
    otherCategoryId = categories[1].id;
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('persists both types, defaults creation, preserves omitted update types, and reports conflicts', async () => {
    const exact = await service.createCategoryRule(userId, {
      categoryId,
      pattern: 'RENT',
    });
    const contains = await service.createCategoryRule(userId, {
      categoryId: otherCategoryId,
      pattern: ' rent ',
      matchType: 'contains',
    });
    expect(exact.matchType).toBe('exact');
    expect(
      (
        await service.updateCategoryRule(userId, contains.id, {
          pattern: 'Rent',
        })
      ).matchType,
    ).toBe('contains');
    await expect(
      service.updateCategoryRule(userId, contains.id, { matchType: 'exact' }),
    ).rejects.toMatchObject({
      details: [expect.objectContaining({ categoryId, field: '/pattern' })],
    });
    expect(
      (await service.listCategoryRules(userId)).map((rule) => rule.matchType),
    ).toEqual(['exact', 'contains']);
  });

  it('replaces only the selected Category, preserves identities and timestamps, and clears atomically', async () => {
    const exact = await service.createCategoryRule(userId, {
      categoryId,
      pattern: 'RENT PAYMENT',
    });
    await service.createCategoryRule(userId, { categoryId, pattern: 'REMOVE' });
    const other = await service.createCategoryRule(userId, {
      categoryId: otherCategoryId,
      pattern: 'POWER',
    });
    const desired: ReplacementCategoryRule[] = [
      { pattern: 'RENT PAYMENT', matchType: 'exact' },
      { pattern: 'MORTGAGE', matchType: 'contains' },
    ];
    const replaced = await service.replaceCategoryRules(
      userId,
      categoryId,
      desired,
    );
    expect(replaced[0]).toEqual(exact);
    expect(replaced[1]).toMatchObject({
      categoryId,
      matchType: 'contains',
      pattern: 'MORTGAGE',
    });
    expect(
      await service.replaceCategoryRules(userId, categoryId, desired),
    ).toEqual(replaced);
    const displayChanged = await service.replaceCategoryRules(
      userId,
      categoryId,
      [{ pattern: ' rent payment ', matchType: 'exact' }],
    );
    expect(displayChanged[0]).toMatchObject({
      id: exact.id,
      createdAt: exact.createdAt,
      pattern: ' rent payment ',
    });
    expect(await service.replaceCategoryRules(userId, categoryId, [])).toEqual(
      [],
    );
    expect(await service.listCategoryRules(userId)).toEqual([other]);
  });

  it('leaves the entire set intact for invalid, duplicate, inactive, and unowned requests', async () => {
    await service.createCategoryRule(userId, { categoryId, pattern: 'RENT' });
    await service.createCategoryRule(userId, {
      categoryId: otherCategoryId,
      pattern: 'POWER',
      matchType: 'contains',
    });
    const before = await service.listCategoryRules(userId);
    await expect(
      service.replaceCategoryRules(userId, categoryId, [
        { pattern: 'NEW', matchType: 'exact' },
        { pattern: ' power ', matchType: 'contains' },
      ]),
    ).rejects.toMatchObject({
      details: [
        expect.objectContaining({
          field: '/rules/1/pattern',
          categoryId: otherCategoryId,
        }),
      ],
    });
    await expect(
      service.replaceCategoryRules(userId, categoryId, [
        { pattern: 'X', matchType: 'exact' },
        { pattern: ' x ', matchType: 'exact' },
      ]),
    ).rejects.toMatchObject({ code: 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS' });
    await expect(
      service.replaceCategoryRules(userId, categoryId, [
        { pattern: ' ', matchType: 'exact' },
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await database
      .getRepository(CategoryEntity)
      .update(categoryId, { isActive: false });
    await expect(
      service.replaceCategoryRules(userId, categoryId, []),
    ).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' });
    await expect(
      service.replaceCategoryRules('9223372036854775807', categoryId, []),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    expect(await service.listCategoryRules(userId)).toEqual(before);
    expect(
      (
        await service.updateCategoryRule(userId, before[0].id, {
          matchType: 'contains',
        })
      ).matchType,
    ).toBe('contains');
    await service.deleteCategoryRule(userId, before[0].id);
  });

  it('rolls back deletions and earlier inserts when a later database write fails', async () => {
    const store = new TypeOrmCategoryRuleStore(database.manager);
    await service.createCategoryRule(userId, {
      categoryId,
      pattern: 'ORIGINAL',
    });
    const before = await service.listCategoryRules(userId);
    await expect(
      store.replaceForCategory(userId, categoryId, [
        { pattern: 'VALID', normalizedPattern: 'valid', matchType: 'exact' },
        {
          pattern: 'x'.repeat(501),
          normalizedPattern: 'too long',
          matchType: 'contains',
        },
      ]),
    ).rejects.toBeDefined();
    expect(await service.listCategoryRules(userId)).toEqual(before);
  });

  it('serializes concurrent replacements of an empty Category without merging their sets', async () => {
    const runner = database.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.manager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .setLock('pessimistic_write')
      .getOne();
    const requests = Promise.all([
      service.replaceCategoryRules(userId, categoryId, [
        { pattern: 'A', matchType: 'exact' },
      ]),
      service.replaceCategoryRules(userId, categoryId, [
        { pattern: 'B', matchType: 'contains' },
      ]),
    ]);
    await runner.commitTransaction();
    await runner.release();
    const results = await requests;
    const final = await service.listCategoryRules(userId);
    expect(final).toHaveLength(1);
    expect(results.some((result) => result[0].id === final[0].id)).toBe(true);
  });

  it('arbitrates concurrent cross-Category duplicates with structured conflicts', async () => {
    const results = await Promise.allSettled([
      service.replaceCategoryRules(userId, categoryId, [
        { pattern: 'SAME', matchType: 'contains' },
      ]),
      service.createCategoryRule(userId, {
        categoryId: otherCategoryId,
        pattern: 'same',
        matchType: 'contains',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    const [persisted] = await service.listCategoryRules(userId);
    expect(failed.reason).toMatchObject({
      code: 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS',
      details: [expect.objectContaining({ categoryId: persisted.categoryId })],
    });
  });

  it('enforces the expanded match type check constraint', async () => {
    await expect(
      database.getRepository(CategoryRuleEntity).insert({
        userId,
        categoryId,
        pattern: 'X',
        normalizedPattern: 'x',
        matchType: 'regex' as 'exact',
      }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
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
      { userId, spaceId: space.id, name: 'Shared Housing', isActive: true },
      { userId, spaceId: space.id, name: 'Shared Bills', isActive: true },
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
    const created = await scopedService.createCategoryRuleInSpace(
      userId,
      space.id,
      { categoryId: sharedCategoryId, pattern: 'RENT' },
    );
    expect(created).toMatchObject({
      spaceId: space.id,
      categoryId: sharedCategoryId,
    });
    await expect(
      scopedService.createCategoryRuleInSpace(member.id, space.id, {
        categoryId: otherSharedCategoryId,
        pattern: ' rent ',
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS' });

    const memberView = await scopedService.listCategoryRulesInSpace(space.id);
    expect(memberView.rules).toEqual([created]);
    await scopedService.replaceCategoryRulesInSpace(
      member.id,
      space.id,
      sharedCategoryId,
      [{ pattern: 'RENT PAYMENT', matchType: 'exact' }],
      memberView.revision,
    );
    await expect(
      scopedService.replaceCategoryRulesInSpace(
        userId,
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
      .save([
        { userId, spaceId: space.id, name: 'Concurrent', isActive: true },
      ]);
    const scopedService = new CategoryRulesService(
      new TypeOrmCategoryRuleStore(database.manager),
      new TypeOrmCategoryRuleCategoryStore(database.manager),
    );
    const { revision } = await scopedService.listCategoryRulesInSpace(space.id);

    const results = await Promise.allSettled([
      scopedService.replaceCategoryRulesInSpace(
        userId,
        space.id,
        category.id,
        [{ pattern: 'OWNER', matchType: 'exact' }],
        revision,
      ),
      scopedService.replaceCategoryRulesInSpace(
        member.id,
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
