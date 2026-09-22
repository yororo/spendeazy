import { ExceptionLogger } from '../../logging/exception-logger';
import { CategoryNameConflictError } from './category-errors';
import type {
  CategoryRecord,
  CategoryStore,
  NewCategory,
} from './category-store';
import { DEFAULT_CATEGORY_CATALOG } from './default-category-catalog';
import { DefaultCategoriesService } from './default-categories.service';

describe('DefaultCategoriesService', () => {
  it('attempts every maintained Default Category in catalog order for a Space', async () => {
    const store = new RecordingCategoryStore();
    const service = new DefaultCategoriesService(store, new RecordingLogger());

    await service.createForSpace('99');

    expect(store.createAttempts).toEqual(
      DEFAULT_CATEGORY_CATALOG.map((category) => ({
        spaceId: '99',
        name: category.name,
        description: category.description,
      })),
    );
  });

  it('retains partial results, continues after failures, and logs each failure safely', async () => {
    const underlyingError = new Error('email=private@example.com clerk=secret');
    const store = new RecordingCategoryStore({
      failuresByName: new Map([['Car', underlyingError]]),
    });
    const logger = new RecordingLogger();
    const service = new DefaultCategoriesService(store, logger);

    await expect(service.createForSpace('99', '42')).resolves.toBeUndefined();

    expect(store.createAttempts).toHaveLength(DEFAULT_CATEGORY_CATALOG.length);
    expect(store.createdCategories.map(({ name }) => name)).toEqual(
      DEFAULT_CATEGORY_CATALOG.filter(({ name }) => name !== 'Car').map(
        ({ name }) => name,
      ),
    );
    expect(logger.errors).toEqual([
      expect.objectContaining({
        event: 'default_category_creation_failed',
        level: 'error',
      }),
    ]);
    expect(JSON.stringify(logger.errors)).not.toContain('email');
    expect(JSON.stringify(logger.errors)).not.toContain('clerk');
    expect(JSON.stringify(logger.errors)).not.toContain('Food & Drink');
  });

  it('treats a default-name conflict as an idempotent success', async () => {
    const store = new RecordingCategoryStore({
      failuresByName: new Map([['Car', new CategoryNameConflictError()]]),
    });
    const logger = new RecordingLogger();
    const service = new DefaultCategoriesService(store, logger);

    await expect(service.createForSpace('99')).resolves.toBeUndefined();

    expect(store.createdCategories.map(({ name }) => name)).toEqual(
      DEFAULT_CATEGORY_CATALOG.filter(({ name }) => name !== 'Car').map(
        ({ name }) => name,
      ),
    );
    expect(logger.errors).toEqual([]);
  });

  it('provisions Space defaults with the actor attribution and no copied custom data', async () => {
    const store = new RecordingCategoryStore();
    const service = new DefaultCategoriesService(store, new RecordingLogger());

    await service.createForSpace('99');

    expect(store.createAttempts).toEqual(
      DEFAULT_CATEGORY_CATALOG.map((category) => ({
        spaceId: '99',
        name: category.name,
        description: category.description,
      })),
    );
  });

  it('does not recreate an existing default while filling missing Space defaults', async () => {
    const store = new RecordingCategoryStore({
      existingSpaceCategories: [
        categoryRecord({ spaceId: '99', name: 'Food & Drink' }),
      ],
    });
    const service = new DefaultCategoriesService(store, new RecordingLogger());

    await service.createForSpace('99', '42');

    expect(store.createAttempts).toHaveLength(
      DEFAULT_CATEGORY_CATALOG.length - 1,
    );
    expect(store.createAttempts).not.toContainEqual(
      expect.objectContaining({ name: 'Food & Drink' }),
    );
  });
});

class RecordingCategoryStore implements CategoryStore {
  readonly createAttempts: NewCategory[] = [];
  readonly createdCategories: NewCategory[] = [];
  private readonly failuresByName: ReadonlyMap<string, Error>;

  constructor(
    options: {
      failuresByName?: ReadonlyMap<string, Error>;
      existingSpaceCategories?: readonly CategoryRecord[];
    } = {},
  ) {
    this.failuresByName = options.failuresByName ?? new Map();
    this.existingSpaceCategories = options.existingSpaceCategories ?? [];
  }

  private readonly existingSpaceCategories: readonly CategoryRecord[];

  create(input: NewCategory): Promise<CategoryRecord> {
    this.createAttempts.push(input);
    const failure = this.failuresByName.get(input.name);
    if (failure) return Promise.reject(failure);
    this.createdCategories.push(input);
    return Promise.resolve(categoryRecordFromInput(input));
  }

  findById(): Promise<CategoryRecord | null> {
    throw new Error('Not used');
  }

  findAll(): Promise<CategoryRecord[]> {
    throw new Error('Not used');
  }

  findAllBySpaceId(spaceId: string): Promise<CategoryRecord[]> {
    return Promise.resolve(
      this.existingSpaceCategories.filter(
        (category) => category.spaceId === spaceId,
      ),
    );
  }

  findByNormalizedName(): Promise<CategoryRecord | null> {
    throw new Error('Not used');
  }

  update(): Promise<CategoryRecord | null> {
    throw new Error('Not used');
  }
}

class RecordingLogger extends ExceptionLogger {
  readonly errors: unknown[] = [];

  constructor() {
    super((line) => this.errors.push(JSON.parse(line)));
  }
}

function categoryRecordFromInput(input: NewCategory): CategoryRecord {
  const timestamp = new Date('2026-09-05T00:00:00.000Z');
  return {
    id: String(Math.random()),
    ...input,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function categoryRecord(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  const timestamp = new Date('2026-09-05T00:00:00.000Z');
  return {
    id: '100',
    spaceId: '99',
    name: 'Existing',
    description: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}
