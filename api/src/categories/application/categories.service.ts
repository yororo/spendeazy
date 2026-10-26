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
import type { CategoryIconKey } from './category-icon';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORY_STORE) private readonly categoryStore: CategoryStore,
  ) {}

  async createCategoryInSpace(
    spaceId: string,
    input: {
      name: string;
      description?: string | null;
      color?: CategoryColor;
      iconKey?: CategoryIconKey;
    },
  ): Promise<CategoryRecord> {
    const name = normalizeCategoryDisplayName(input.name);
    await this.ensureNameAvailableInSpace(spaceId, name);

    return this.categoryStore.create({
      spaceId,
      name,
      description: normalizeCategoryDescription(input.description),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.iconKey === undefined ? {} : { iconKey: input.iconKey }),
    });
  }

  listCategoriesInSpace(spaceId: string): Promise<CategoryRecord[]> {
    return this.categoryStore.findAllBySpaceId(spaceId);
  }

  async getCategoryInSpace(
    spaceId: string,
    id: string,
  ): Promise<CategoryRecord> {
    const category = await this.categoryStore.findBySpaceId(spaceId, id);
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

    const updatedCategory = await this.categoryStore.updateInSpace(
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
      await this.categoryStore.findByNormalizedNameInSpace(
        spaceId,
        normalizeCategoryName(name),
      );
    if (existingCategory && existingCategory.id !== currentCategoryId) {
      throw new CategoryNameConflictError();
    }
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
    ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
    expectedUpdatedAt: input.expectedUpdatedAt,
  };
}

function isNoOp(
  currentCategory: Pick<
    CategoryRecord,
    'name' | 'description' | 'color' | 'iconKey' | 'isActive'
  >,
  changes: UpdateCategory,
): boolean {
  return (
    (changes.name === undefined || changes.name === currentCategory.name) &&
    (changes.description === undefined ||
      changes.description === currentCategory.description) &&
    (changes.color === undefined || changes.color === currentCategory.color) &&
    (changes.iconKey === undefined ||
      changes.iconKey === currentCategory.iconKey) &&
    (changes.isActive === undefined ||
      changes.isActive === currentCategory.isActive)
  );
}

function assertCurrentVersion(
  updatedAt: Date,
  expectedUpdatedAt: string,
): void {
  const expectedTime = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedTime) || updatedAt.getTime() !== expectedTime) {
    throw new StaleEditError();
  }
}
