import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CategoriesService } from '../src/categories/application/categories.service';
import { toCategoryResponse } from '../src/categories/presentation/categories.controller';
import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { TypeOrmCategoryStore } from '../src/categories/infrastructure/typeorm-category-store';

const databaseUrl = process.env.TEST_CATEGORY_COLOR_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('category colors with PostgreSQL', () => {
  let database: DataSource;
  let categories: CategoriesService;
  let userId: string;

  beforeAll(async () => {
    database = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: DATABASE_ENTITIES,
      migrations: DATABASE_MIGRATIONS,
      synchronize: false,
    }).initialize();
    await database.runMigrations();
    categories = new CategoriesService(
      new TypeOrmCategoryStore(database.manager),
    );
  });

  beforeEach(async () => {
    const unique = randomUUID();
    const user = await database.getRepository(UserEntity).save({
      clerkUserId: unique,
      name: 'Category color test',
      email: `${unique}@example.test`,
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('persists saved colors across reloads and Category lifecycle changes', async () => {
    const created = await categories.createCategory(userId, {
      name: 'Dining',
      color: 'teal',
    });
    expect(created.color).toBe('teal');

    const reloadedService = new CategoriesService(
      new TypeOrmCategoryStore(database.manager),
    );
    await expect(
      reloadedService.getCategory(userId, created.id),
    ).resolves.toMatchObject({ color: 'teal' });

    await reloadedService.updateCategory(userId, created.id, {
      color: 'forest',
    });
    await reloadedService.updateCategory(userId, created.id, {
      name: 'Dining renamed',
      isActive: false,
    });
    await reloadedService.updateCategory(userId, created.id, {
      isActive: true,
    });

    const persisted = await reloadedService.getCategory(userId, created.id);
    expect(persisted).toMatchObject({
      name: 'Dining renamed',
      color: 'forest',
      isActive: true,
    });
  });

  it('resolves a null legacy color from Category identity, unchanged by rename', async () => {
    const legacy = await categories.createCategory(userId, {
      name: 'Legacy category',
    });
    expect(legacy.color).toBeNull();
    const defaultColor = toCategoryResponse(legacy).color;

    await categories.updateCategory(userId, legacy.id, {
      name: 'Legacy category renamed',
    });

    const reloaded = await categories.getCategory(userId, legacy.id);
    expect(reloaded.color).toBeNull();
    expect(toCategoryResponse(reloaded).color).toBe(defaultColor);
  });

  it('rejects unsupported palette values at the database boundary', async () => {
    const category = await categories.createCategory(userId, {
      name: 'Database validation',
      color: 'teal',
    });

    await expect(
      database.getRepository(CategoryEntity).update(category.id, {
        color: 'not-a-palette-color' as never,
      }),
    ).rejects.toBeDefined();

    await expect(
      categories.getCategory(userId, category.id),
    ).resolves.toMatchObject({ color: 'teal' });
  });
});
