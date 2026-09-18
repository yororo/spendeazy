import { Inject, Injectable } from '@nestjs/common';
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

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORY_STORE) private readonly categoryStore: CategoryStore,
  ) {}

  async createCategory(
    userId: string,
    input: {
      name: string;
      description?: string | null;
      color?: CategoryColor;
    },
  ): Promise<CategoryRecord> {
    const name = normalizeCategoryDisplayName(input.name);
    await this.ensureNameAvailable(userId, name);

    return this.categoryStore.create({
      userId,
      name,
      description: normalizeCategoryDescription(input.description),
      ...(input.color === undefined ? {} : { color: input.color }),
    });
  }

  listCategories(userId: string): Promise<CategoryRecord[]> {
    return this.categoryStore.findAll(userId);
  }

  async getCategory(userId: string, id: string): Promise<CategoryRecord> {
    const category = await this.categoryStore.findById(userId, id);
    if (!category) {
      throw new CategoryNotFoundError();
    }

    return category;
  }

  async updateCategory(
    userId: string,
    id: string,
    input: UpdateCategory,
  ): Promise<CategoryRecord> {
    const currentCategory = await this.getCategory(userId, id);
    const changes = normalizeUpdate(input);

    if (
      changes.name !== undefined &&
      normalizeCategoryName(changes.name) !==
        normalizeCategoryName(currentCategory.name)
    ) {
      await this.ensureNameAvailable(userId, changes.name, id);
    }

    if (isNoOp(currentCategory, changes)) {
      return currentCategory;
    }

    const updatedCategory = await this.categoryStore.update(
      userId,
      id,
      changes,
    );
    if (!updatedCategory) {
      throw new CategoryNotFoundError();
    }

    return updatedCategory;
  }

  deactivateCategory(userId: string, id: string): Promise<CategoryRecord> {
    return this.updateCategory(userId, id, { isActive: false });
  }

  reactivateCategory(userId: string, id: string): Promise<CategoryRecord> {
    return this.updateCategory(userId, id, { isActive: true });
  }

  private async ensureNameAvailable(
    userId: string,
    name: string,
    currentCategoryId?: string,
  ): Promise<void> {
    const existingCategory = await this.categoryStore.findByNormalizedName(
      userId,
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
