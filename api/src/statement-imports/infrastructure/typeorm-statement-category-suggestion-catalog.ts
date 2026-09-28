import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import type {
  CategorySuggestionCatalog,
  CategorySuggestionCandidate,
  CategorySuggestionExample,
  CategorySuggestionCatalogStore,
} from '../application/statement-category-suggestions';
import {
  MAX_CATEGORY_SUGGESTION_HISTORY_PER_CATEGORY,
  MAX_SUGGESTIBLE_ACTIVE_CATEGORIES,
} from '../application/statement-category-suggestions';

@Injectable()
export class TypeOrmStatementCategorySuggestionCatalog implements CategorySuggestionCatalogStore {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async findSuggestionCatalogInSpace(
    spaceId: string,
  ): Promise<CategorySuggestionCatalog> {
    const categories = await this.entityManager
      .getRepository(CategoryEntity)
      .find({
        select: { id: true, name: true, description: true },
        where: { spaceId, isActive: true },
        order: { id: 'ASC' },
        take: MAX_SUGGESTIBLE_ACTIVE_CATEGORIES + 1,
      });

    const activeCategories = categories.map(toCandidate);
    if (
      activeCategories.length === 0 ||
      activeCategories.length > MAX_SUGGESTIBLE_ACTIVE_CATEGORIES
    ) {
      return { categories: activeCategories, examples: [] };
    }

    const queryResult: unknown = await this.entityManager.query(
      `
        SELECT history.category_id AS "categoryId", history.description
        FROM categories AS category
        CROSS JOIN LATERAL (
          SELECT
            transaction.category_id,
            transaction.description,
            transaction.purchase_date,
            transaction.id
          FROM transactions AS transaction
          WHERE transaction.space_id = category.space_id
            AND transaction.category_id = category.id
            AND transaction.deleted_at IS NULL
          ORDER BY transaction.purchase_date DESC, transaction.id DESC
          LIMIT $3
        ) AS history
        WHERE category.space_id = $1
          AND category.is_active = TRUE
          AND category.id = ANY($2::bigint[])
        ORDER BY category.id ASC, history.purchase_date DESC, history.id DESC
      `,
      [
        spaceId,
        activeCategories.map(({ id }) => id),
        MAX_CATEGORY_SUGGESTION_HISTORY_PER_CATEGORY,
      ],
    );
    const examples = queryResult as CategorySuggestionExample[];

    return {
      categories: activeCategories,
      examples,
    };
  }

  async findActiveCategoryInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<CategorySuggestionCandidate | null> {
    const category = await this.entityManager
      .getRepository(CategoryEntity)
      .findOne({
        select: { id: true, name: true, description: true },
        where: { id: categoryId, spaceId, isActive: true },
      });

    return category ? toCandidate(category) : null;
  }
}

function toCandidate(category: CategoryEntity): CategorySuggestionCandidate {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
  };
}
