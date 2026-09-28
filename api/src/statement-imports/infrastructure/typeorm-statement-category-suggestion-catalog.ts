import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import type {
  CategorySuggestionCandidate,
  CategorySuggestionCatalogStore,
} from '../application/statement-category-suggestions';
import { MAX_SUGGESTIBLE_ACTIVE_CATEGORIES } from '../application/statement-category-suggestions';

@Injectable()
export class TypeOrmStatementCategorySuggestionCatalog implements CategorySuggestionCatalogStore {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async findActiveCategoriesInSpace(
    spaceId: string,
  ): Promise<CategorySuggestionCandidate[]> {
    const categories = await this.entityManager
      .getRepository(CategoryEntity)
      .find({
        select: { id: true, name: true, description: true },
        where: { spaceId, isActive: true },
        order: { id: 'ASC' },
        take: MAX_SUGGESTIBLE_ACTIVE_CATEGORIES + 1,
      });

    return categories.map(toCandidate);
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
