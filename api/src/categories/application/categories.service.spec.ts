import type {
  CategoryRecord,
  CategoryStore,
  NewCategory,
  UpdateCategory,
} from './category-store';
import {
  CategoryNameConflictError,
  CategoryNotFoundError,
} from './category-errors';
import { CategoriesService, normalizeCategoryName } from './categories.service';

describe('CategoriesService', () => {
  it('creates a category with a trimmed display name and normalized uniqueness check', async () => {
    const store = new CategoryStoreFake();
    const service = new CategoriesService(store);

    const category = await service.createCategory('1', {
      name: '  Dining Out  ',
      description: '  Restaurants and cafes  ',
    });

    expect(category).toEqual(store.createdCategory);
    expect(store.createdInput).toEqual({
      userId: '1',
      name: 'Dining Out',
      description: 'Restaurants and cafes',
    });
    expect(store.checkedName).toBe('dining out');
  });

  it('persists a selected palette identifier when creating a Category', async () => {
    const store = new CategoryStoreFake();
    const service = new CategoriesService(store);

    await service.createCategory('1', {
      name: 'Dining',
      color: 'teal',
    });

    expect(store.createdInput).toEqual({
      userId: '1',
      name: 'Dining',
      description: null,
      color: 'teal',
    });
  });

  it('normalizes blank descriptions to null when creating and updating', async () => {
    const original = categoryRecord({ description: 'Everyday food' });
    const store = new CategoryStoreFake({ categories: [original] });
    const service = new CategoriesService(store);

    await service.createCategory('1', { name: 'Dining', description: '   ' });
    expect(store.createdInput).toEqual({
      userId: '1',
      name: 'Dining',
      description: null,
    });

    await service.updateCategory('1', '1', { description: '   ' });
    expect(store.updatedInput).toEqual({ description: null });
  });

  it('accepts omitted and null descriptions and trims description updates', async () => {
    const original = categoryRecord();
    const store = new CategoryStoreFake({ categories: [original] });
    const service = new CategoriesService(store);

    await service.createCategory('1', { name: 'Dining' });
    expect(store.createdInput?.description).toBeNull();
    await service.createCategory('1', { name: 'Dining', description: null });
    expect(store.createdInput?.description).toBeNull();

    await service.updateCategory('1', '1', {
      description: '  Everyday food  ',
    });
    expect(store.updatedInput).toEqual({ description: 'Everyday food' });
  });

  it('rejects a duplicate normalized name for the same user', async () => {
    const store = new CategoryStoreFake({
      categories: [categoryRecord({ userId: '1', name: 'Groceries' })],
    });
    const service = new CategoriesService(store);

    await expect(
      service.createCategory('1', { name: ' groceries ' }),
    ).rejects.toBeInstanceOf(CategoryNameConflictError);
    expect(store.createdInput).toBeUndefined();
  });

  it("allows another user's category to use the same normalized name", async () => {
    const store = new CategoryStoreFake({
      categories: [categoryRecord({ userId: '2', name: 'Groceries' })],
    });
    const service = new CategoriesService(store);

    await expect(
      service.createCategory('1', { name: ' groceries ' }),
    ).resolves.toEqual(
      expect.objectContaining({ userId: '1', name: 'groceries' }),
    );
    expect(store.createdInput).toEqual({
      userId: '1',
      name: 'groceries',
      description: null,
    });
  });

  it('lists all owned categories with their active state', async () => {
    const categories = [
      categoryRecord({ id: '1', userId: '1', isActive: true }),
      categoryRecord({ id: '2', userId: '1', isActive: false }),
    ];
    const service = new CategoriesService(
      new CategoryStoreFake({ categories }),
    );

    await expect(service.listCategories('1')).resolves.toEqual(categories);
  });

  it('does not expose categories owned by another user', async () => {
    const store = new CategoryStoreFake({
      categories: [categoryRecord({ id: '2', userId: '2' })],
    });
    const service = new CategoriesService(store);

    await expect(service.listCategories('1')).resolves.toEqual([]);
    await expect(service.getCategory('1', '2')).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
  });

  it('returns the same not-found error for an absent category', async () => {
    const service = new CategoriesService(new CategoryStoreFake());

    await expect(service.getCategory('1', '404')).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
  });

  it('renames a category while preserving the display casing', async () => {
    const original = categoryRecord({ id: '1', name: 'Dining Out' });
    const updated = categoryRecord({
      ...original,
      name: 'Restaurants',
    });
    const store = new CategoryStoreFake({
      categories: [original],
      updatedCategory: updated,
    });
    const service = new CategoriesService(store);

    await expect(
      service.updateCategory('1', '1', { name: ' Restaurants ' }),
    ).resolves.toEqual(updated);
    expect(store.updatedInput).toEqual({ name: 'Restaurants' });
    expect(store.checkedName).toBe('restaurants');
  });

  it('updates only the selected Category Color without changing other details', async () => {
    const original = categoryRecord({ id: '1', color: 'coral' });
    const updated = categoryRecord({ ...original, color: 'teal' });
    const store = new CategoryStoreFake({
      categories: [original],
      updatedCategory: updated,
    });
    const service = new CategoriesService(store);

    await expect(
      service.updateCategory('1', '1', { color: 'teal' }),
    ).resolves.toEqual(updated);
    expect(store.updatedInput).toEqual({ color: 'teal' });
  });

  it('rejects a rename that would create a normalized duplicate', async () => {
    const store = new CategoryStoreFake({
      categories: [
        categoryRecord({ id: '1', name: 'Dining Out' }),
        categoryRecord({ id: '2', name: 'Groceries' }),
      ],
    });
    const service = new CategoriesService(store);

    await expect(
      service.updateCategory('1', '1', { name: ' GROCERIES ' }),
    ).rejects.toBeInstanceOf(CategoryNameConflictError);
    expect(store.updatedInput).toBeUndefined();
  });

  it('does not write a no-op rename or state change', async () => {
    const original = categoryRecord({
      id: '1',
      name: 'Groceries',
      isActive: false,
    });
    const store = new CategoryStoreFake({ categories: [original] });
    const service = new CategoriesService(store);

    await expect(
      service.updateCategory('1', '1', {
        name: ' Groceries ',
        isActive: false,
      }),
    ).resolves.toEqual(original);
    expect(store.updatedInput).toBeUndefined();
  });

  it('deactivates and reactivates a category without deleting it', async () => {
    const original = categoryRecord({ id: '1', isActive: true });
    const deactivated = categoryRecord({ ...original, isActive: false });
    const reactivated = categoryRecord({ ...deactivated, isActive: true });
    const store = new CategoryStoreFake({
      categories: [original],
      updatedCategory: deactivated,
    });
    const service = new CategoriesService(store);

    await expect(service.deactivateCategory('1', '1')).resolves.toEqual(
      deactivated,
    );

    store.categories[0] = deactivated;
    store.updatedCategory = reactivated;
    await expect(service.reactivateCategory('1', '1')).resolves.toEqual(
      reactivated,
    );
    expect(store.updatedInput).toEqual({ isActive: true });
  });
});

class CategoryStoreFake implements CategoryStore {
  createdInput: NewCategory | undefined;
  createdCategory: CategoryRecord | undefined;
  updatedInput: UpdateCategory | undefined;
  checkedName: string | undefined;
  categories: CategoryRecord[];
  updatedCategory: CategoryRecord | undefined;

  constructor(
    options: {
      categories?: CategoryRecord[];
      updatedCategory?: CategoryRecord;
    } = {},
  ) {
    this.categories = options.categories ?? [];
    this.updatedCategory = options.updatedCategory;
  }

  findById(userId: string, id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(
      this.categories.find(
        (category) => category.userId === userId && category.id === id,
      ) ?? null,
    );
  }

  findAll(userId: string): Promise<CategoryRecord[]> {
    return Promise.resolve(
      this.categories.filter((category) => category.userId === userId),
    );
  }

  findByNormalizedName(
    userId: string,
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    this.checkedName = normalizedName;
    return Promise.resolve(
      this.categories.find(
        (category) =>
          category.userId === userId &&
          normalizeCategoryName(category.name) === normalizedName,
      ) ?? null,
    );
  }

  create(input: NewCategory): Promise<CategoryRecord> {
    this.createdInput = input;
    this.createdCategory = categoryRecord({
      ...input,
      id: '2',
    });
    return Promise.resolve(this.createdCategory);
  }

  update(
    _userId: string,
    id: string,
    input: UpdateCategory,
  ): Promise<CategoryRecord | null> {
    this.updatedInput = input;
    return Promise.resolve(
      this.updatedCategory ??
        categoryRecord({
          ...this.categories.find((category) => category.id === id),
          ...input,
          id,
        }),
    );
  }
}

function categoryRecord(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  const timestamp = new Date('2026-08-29T00:00:00.000Z');
  return {
    id: '1',
    userId: '1',
    name: 'Groceries',
    description: null,
    color: 'coral',
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
