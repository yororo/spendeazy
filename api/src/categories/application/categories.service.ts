import { Inject, Injectable } from '@nestjs/common';
import { StaleEditError } from '../../errors/application-error';
import {
  CategoryNameConflictError,
  CategoryNotFoundError,
} from './category-errors';
import {
  CATEGORY_STORE,
  type CategoryRecord,
  type CategoryStore,
  type UpdateCategory,
} from './category-store';
import type { CategoryColor } from './category-color';

type SpaceCategoryStore = {
  findBySpaceId: NonNullable<CategoryStore['findBySpaceId']>;
  findAllBySpaceId: NonNullable<CategoryStore['findAllBySpaceId']>;
  findByNormalizedNameInSpace: NonNullable<
    CategoryStore['findByNormalizedNameInSpace']
  >;
  updateInSpace: NonNullable<CategoryStore['updateInSpace']>;
};

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORY_STORE) private readonly categoryStore: CategoryStore,
  ) {}

  async createCategoryInSpace(
    userId: string,
    spaceId: string,
    input: {
      name: string;
      description?: string | null;
      color?: CategoryColor;
    },
  ): Promise<CategoryRecord> {
    const name = normalizeCategoryDisplayName(input.name);
    await this.ensureNameAvailableInSpace(spaceId, name);

    return this.categoryStore.create({
      userId,
      spaceId,
      name,
      description: normalizeCategoryDescription(input.description),
      ...(input.color === undefined ? {} : { color: input.color }),
    });
  }

  listCategoriesInSpace(spaceId: string): Promise<CategoryRecord[]> {
    return this.getSpaceCategoryStore().findAllBySpaceId(spaceId);
  }

  async getCategoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<CategoryRecord> {
    const category = await this.getSpaceCategoryStore().findBySpaceId(
      spaceId,
      id,
    );
    if (!category) {
      throw new CategoryNotFoundError();
    }

    return category;
  }

  async updateCategoryInSpace(
    spaceId: string,
    id: string,
    input: UpdateCategory,
  ): Promise<CategoryRecord> {
    const currentCategory = await this.getCategoryInSpace(spaceId, id);
    const changes = normalizeUpdate(input);
    assertCurrentVersion(currentCategory.updatedAt, changes.expectedUpdatedAt);

    if (
      changes.name !== undefined &&
      normalizeCategoryName(changes.name) !==
        normalizeCategoryName(currentCategory.name)
    ) {
      await this.ensureNameAvailableInSpace(spaceId, changes.name, id);
    }

    if (isNoOp(currentCategory, changes)) {
      return currentCategory;
    }

    const updatedCategory = await this.getSpaceCategoryStore().updateInSpace(
      spaceId,
      id,
      changes,
    );
    if (!updatedCategory) {
      throw new CategoryNotFoundError();
    }

    return updatedCategory;
  }

  private async ensureNameAvailableInSpace(
    spaceId: string,
    name: string,
    currentCategoryId?: string,
  ): Promise<void> {
    const existingCategory =
      await this.getSpaceCategoryStore().findByNormalizedNameInSpace(
        spaceId,
        normalizeCategoryName(name),
      );
    if (existingCategory && existingCategory.id !== currentCategoryId) {
      throw new CategoryNameConflictError();
    }
  }

  private getSpaceCategoryStore(): SpaceCategoryStore {
    const store = this.categoryStore;
    if (
      !store.findBySpaceId ||
      !store.findByNormalizedNameInSpace ||
      !store.updateInSpace
    ) {
      throw new Error('Space-scoped Category persistence is not configured.');
    }

    return {
      findBySpaceId: (spaceId, id) => store.findBySpaceId!(spaceId, id),
      findAllBySpaceId: (spaceId) => store.findAllBySpaceId(spaceId),
      findByNormalizedNameInSpace: (spaceId, normalizedName) =>
        store.findByNormalizedNameInSpace!(spaceId, normalizedName),
      updateInSpace: (spaceId, id, input) =>
        store.updateInSpace!(spaceId, id, input),
    };
  }
}

export function normalizeCategoryDisplayName(name: string): string {
  return name.trim();
}

export function normalizeCategoryName(name: string): string {
  return normalizeCategoryDisplayName(name).toLowerCase();
}

export function normalizeCategoryDescription(
  description: string | null | undefined,
): string | null {
  const normalized = description?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}

function normalizeUpdate(input: UpdateCategory): UpdateCategory {
  return {
    ...(input.name !== undefined
      ? { name: normalizeCategoryDisplayName(input.name) }
      : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.description !== undefined
      ? { description: normalizeCategoryDescription(input.description) }
      : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.expectedUpdatedAt === undefined
      ? {}
      : { expectedUpdatedAt: input.expectedUpdatedAt }),
  };
}

function isNoOp(
  currentCategory: Pick<
    CategoryRecord,
    'name' | 'description' | 'color' | 'isActive'
  >,
  changes: UpdateCategory,
): boolean {
  return (
    (changes.name === undefined || changes.name === currentCategory.name) &&
    (changes.description === undefined ||
      changes.description === currentCategory.description) &&
    (changes.color === undefined || changes.color === currentCategory.color) &&
    (changes.isActive === undefined ||
      changes.isActive === currentCategory.isActive)
  );
}

function assertCurrentVersion(
  updatedAt: Date,
  expectedUpdatedAt: string | undefined,
): void {
  if (expectedUpdatedAt === undefined) return;

  const expectedTime = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedTime) || updatedAt.getTime() !== expectedTime) {
    throw new StaleEditError();
  }
}
