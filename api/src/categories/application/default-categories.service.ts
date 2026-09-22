import { Inject, Injectable } from '@nestjs/common';
import type { ExceptionReporter } from '../../logging/exception-logger';
import { CATEGORY_STORE, type CategoryStore } from './category-store';
import { CategoryNameConflictError } from './category-errors';
import { DEFAULT_CATEGORY_CATALOG } from './default-category-catalog';

export const DEFAULT_CATEGORIES_LOGGER = Symbol('DEFAULT_CATEGORIES_LOGGER');
export const DEFAULT_CATEGORY_PROVISIONER = Symbol(
  'DEFAULT_CATEGORY_PROVISIONER',
);

export interface DefaultCategoryProvisioner {
  createForSpace(spaceId: string): Promise<void>;
}

@Injectable()
export class DefaultCategoriesService implements DefaultCategoryProvisioner {
  constructor(
    @Inject(CATEGORY_STORE) private readonly categoryStore: CategoryStore,
    @Inject(DEFAULT_CATEGORIES_LOGGER)
    private readonly logger: ExceptionReporter,
  ) {}

  async createForSpace(spaceId: string): Promise<void> {
    const existingNames = new Set(
      (await this.categoryStore.findAllBySpaceId(spaceId)).map((category) =>
        normalizeCategoryName(category.name),
      ),
    );

    for (const category of DEFAULT_CATEGORY_CATALOG) {
      if (existingNames.has(normalizeCategoryName(category.name))) continue;

      try {
        await this.categoryStore.create({
          spaceId,
          ...category,
        });
      } catch (error: unknown) {
        if (error instanceof CategoryNameConflictError) continue;
        this.logger.report('default_category_creation_failed', error);
      }
    }
  }
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}
