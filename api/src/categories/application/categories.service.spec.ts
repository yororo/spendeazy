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
import { StaleEditError } from '../../errors/application-error';
import { CategoriesService, normalizeCategoryName } from './categories.service';

describe('CategoriesService', () => {
  it('creates a category with a trimmed display name and normalized uniqueness check', async () => {
    const store = new CategoryStoreFake();
    const service = new CategoriesService(store);

    const category = await service.createCategoryInSpace('1', {
      name: '  Dining Out  ',
      description: '  Restaurants and cafes  ',
    });

    expect(category).toEqual(store.createdCategory);
    expect(store.createdInput).toEqual({
      spaceId: '1',
      name: 'Dining Out',
      description: 'Restaurants and cafes',
    });
    expect(store.checkedName).toBe('dining out');
  });

  it('persists a selected palette identifier when creating a Category', async () => {
    const store = new CategoryStoreFake();
    const service = new CategoriesService(store);

    await service.createCategoryInSpace('1', {
      name: 'Dining',
      color: 'teal',
    });

    expect(store.createdInput).toEqual({
      spaceId: '1',
      name: 'Dining',
      description: null,
      color: 'teal',
    });
  });

  it('normalizes blank descriptions to null when creating and updating', async () => {
    const original = categoryRecord({ description: 'Everyday food' });
    const store = new CategoryStoreFake({ categories: [original] });
    const service = new CategoriesService(store);

    await service.createCategoryInSpace('1', {
      name: 'Dining',
      description: '   ',
    });
    expect(store.createdInput).toEqual({
      spaceId: '1',
      name: 'Dining',
      description: null,
    });

    await service.updateCategoryInSpace('1', '1', {
      description: '   ',
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });
    expect(store.updatedInput).toEqual({
      description: null,
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });
  });

  it('accepts omitted and null descriptions and trims description updates', async () => {
    const original = categoryRecord();
    const store = new CategoryStoreFake({ categories: [original] });
    const service = new CategoriesService(store);

    await service.createCategoryInSpace('1', { name: 'Dining' });
    expect(store.createdInput?.description).toBeNull();
    await service.createCategoryInSpace('1', {
      name: 'Dining',
      description: null,
    });
    expect(store.createdInput?.description).toBeNull();

    await service.updateCategoryInSpace('1', '1', {
      description: '  Everyday food  ',
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });
    expect(store.updatedInput).toEqual({
      description: 'Everyday food',
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });
  });

  it('rejects a duplicate normalized name for the same user', async () => {
    const store = new CategoryStoreFake({
      categories: [categoryRecord({ spaceId: '1', name: 'Groceries' })],
    });
    const service = new CategoriesService(store);

    await expect(
      service.createCategoryInSpace('1', { name: ' groceries ' }),
    ).rejects.toBeInstanceOf(CategoryNameConflictError);
    expect(store.createdInput).toBeUndefined();
  });

  it("allows another user's category to use the same normalized name", async () => {
    const store = new CategoryStoreFake({
      categories: [categoryRecord({ spaceId: '2', name: 'Groceries' })],
    });
    const service = new CategoriesService(store);

    await expect(
      service.createCategoryInSpace('1', { name: ' groceries ' }),
    ).resolves.toEqual(
      expect.objectContaining({ spaceId: '1', name: 'groceries' }),
    );
    expect(store.createdInput).toEqual({
      spaceId: '1',
      name: 'groceries',
      description: null,
    });
  });

  it('lists all owned categories with their active state', async () => {
    const categories = [
      categoryRecord({ id: '1', spaceId: '1', isActive: true }),
      categoryRecord({ id: '2', spaceId: '1', isActive: false }),
    ];
    const service = new CategoriesService(
      new CategoryStoreFake({ categories }),
    );

    await expect(service.listCategoriesInSpace('1')).resolves.toEqual(
      categories,
    );
  });

  it('does not expose categories owned by another user', async () => {
    const store = new CategoryStoreFake({
      categories: [categoryRecord({ id: '2', spaceId: '2' })],
    });
    const service = new CategoriesService(store);

    await expect(service.listCategoriesInSpace('1')).resolves.toEqual([]);
    await expect(service.getCategoryInSpace('1', '2')).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
  });

  it('returns the same not-found error for an absent category', async () => {
    const service = new CategoriesService(new CategoryStoreFake());

    await expect(service.getCategoryInSpace('1', '404')).rejects.toBeInstanceOf(
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
      service.updateCategoryInSpace('1', '1', {
        name: ' Restaurants ',
        expectedUpdatedAt: original.updatedAt.toISOString(),
      }),
    ).resolves.toEqual(updated);
    expect(store.updatedInput).toEqual({
      name: 'Restaurants',
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });
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
      service.updateCategoryInSpace('1', '1', {
        color: 'teal',
        expectedUpdatedAt: original.updatedAt.toISOString(),
      }),
    ).resolves.toEqual(updated);
    expect(store.updatedInput).toEqual({
      color: 'teal',
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });
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
      service.updateCategoryInSpace('1', '1', {
        name: ' GROCERIES ',
        expectedUpdatedAt: '2026-08-29T00:00:00.000Z',
      }),
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
      service.updateCategoryInSpace('1', '1', {
        name: ' Groceries ',
        isActive: false,
        expectedUpdatedAt: original.updatedAt.toISOString(),
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

    await expect(
      service.updateCategoryInSpace('1', '1', {
        isActive: false,
        expectedUpdatedAt: original.updatedAt.toISOString(),
      }),
    ).resolves.toEqual(deactivated);

    store.categories[0] = deactivated;
    store.updatedCategory = reactivated;
    await expect(
      service.updateCategoryInSpace('1', '1', {
        isActive: true,
        expectedUpdatedAt: deactivated.updatedAt.toISOString(),
      }),
    ).resolves.toEqual(reactivated);
    expect(store.updatedInput).toEqual({
      isActive: true,
      expectedUpdatedAt: deactivated.updatedAt.toISOString(),
    });
  });

  it('reads and writes Categories through the requested Space scope', async () => {
    const personalCategory = categoryRecord({
      id: '1',
      spaceId: '10',
      name: 'Groceries',
    });
    const sharedCategory = categoryRecord({
      id: '2',
      spaceId: '11',
      name: 'Groceries',
    });
    const store = new CategoryStoreFake({
      categories: [personalCategory, sharedCategory],
    });
    const service = new CategoriesService(store);

    await expect(service.listCategoriesInSpace('10')).resolves.toEqual([
      personalCategory,
    ]);
    await expect(service.getCategoryInSpace('11', '1')).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
    await expect(
      service.createCategoryInSpace('10', { name: ' Dining ' }),
    ).resolves.toEqual(expect.objectContaining({ spaceId: '10' }));
    expect(store.createdInput).toEqual({
      spaceId: '10',
      name: 'Dining',
      description: null,
    });

    await service.updateCategoryInSpace('10', '1', {
      isActive: false,
      expectedUpdatedAt: personalCategory.updatedAt.toISOString(),
    });
    expect(store.updatedInput).toEqual({
      isActive: false,
      expectedUpdatedAt: personalCategory.updatedAt.toISOString(),
    });
  });

  it('rejects a stale scoped Category edit even when the requested change is a no-op', async () => {
    const category = categoryRecord({ spaceId: '10' });
    const store = new CategoryStoreFake({ categories: [category] });
    const service = new CategoriesService(store);

    await expect(
      service.updateCategoryInSpace('10', category.id, {
        name: category.name,
        expectedUpdatedAt: '2026-08-28T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect(store.updatedInput).toBeUndefined();
  });

  it('rejects a Category edit without the version returned by its last read', async () => {
    const category = categoryRecord({ spaceId: '10' });
    const store = new CategoryStoreFake({ categories: [category] });
    const service = new CategoriesService(store);

    await expect(
      service.updateCategoryInSpace('10', category.id, {
        name: 'Renamed',
        expectedUpdatedAt: undefined as unknown as string,
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
    expect(store.updatedInput).toBeUndefined();
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

  create(input: NewCategory): Promise<CategoryRecord> {
    this.createdInput = input;
    this.createdCategory = categoryRecord({
      ...input,
      id: '2',
    });
    return Promise.resolve(this.createdCategory);
  }

  findBySpaceId(spaceId: string, id: string): Promise<CategoryRecord | null> {
    return Promise.resolve(
      this.categories.find(
        (category) => category.spaceId === spaceId && category.id === id,
      ) ?? null,
    );
  }

  findAllBySpaceId(spaceId: string): Promise<CategoryRecord[]> {
    return Promise.resolve(
      this.categories.filter((category) => category.spaceId === spaceId),
    );
  }

  findByNormalizedNameInSpace(
    spaceId: string,
    normalizedName: string,
  ): Promise<CategoryRecord | null> {
    this.checkedName = normalizedName;
    return Promise.resolve(
      this.categories.find(
        (category) =>
          category.spaceId === spaceId &&
          normalizeCategoryName(category.name) === normalizedName,
      ) ?? null,
    );
  }

  updateInSpace(
    _spaceId: string,
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
    spaceId: '1',
    name: 'Groceries',
    description: null,
    color: 'coral',
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
