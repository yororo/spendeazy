import { Inject, Injectable } from '@nestjs/common';
import type { ExceptionReporter } from '../../logging/exception-logger';
import { CATEGORY_STORE, type CategoryStore } from './category-store';
import { DEFAULT_CATEGORY_CATALOG } from './default-category-catalog';

export const DEFAULT_CATEGORIES_LOGGER = Symbol('DEFAULT_CATEGORIES_LOGGER');
export const DEFAULT_CATEGORY_PROVISIONER = Symbol(
  'DEFAULT_CATEGORY_PROVISIONER',
);

export interface DefaultCategoryProvisioner {
  createForNewUser(userId: string): Promise<void>;
}

@Injectable()
export class DefaultCategoriesService implements DefaultCategoryProvisioner {
  constructor(
    @Inject(CATEGORY_STORE) private readonly categoryStore: CategoryStore,
    @Inject(DEFAULT_CATEGORIES_LOGGER)
    private readonly logger: ExceptionReporter,
  ) {}

  async createForNewUser(userId: string): Promise<void> {
    for (const category of DEFAULT_CATEGORY_CATALOG) {
      try {
        await this.categoryStore.create({ userId, ...category });
      } catch (error: unknown) {
        this.logger.report('default_category_creation_failed', error);
      }
    }
  }
}
