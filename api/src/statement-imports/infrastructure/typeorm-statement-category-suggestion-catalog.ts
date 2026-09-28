import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import type {
  CategorySuggestionCatalog,
  CategorySuggestionCandidate,
  CategorySuggestionExample,
  CategorySuggestionCatalogStore,
} from '../application/statement-category-suggestions';
import { MAX_SUGGESTIBLE_ACTIVE_CATEGORIES } from '../application/statement-category-suggestions';

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

    const examples = await this.entityManager
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .distinctOn(['transaction.categoryId'])
      .innerJoin(
        CategoryEntity,
        'category',
        'category.id = transaction.categoryId AND category.spaceId = transaction.spaceId AND category.isActive = :isActive',
        { isActive: true },
      )
      .select('transaction.categoryId', 'categoryId')
      .addSelect('transaction.description', 'description')
      .addSelect('transaction.purchaseDate', 'purchaseDate')
      .addSelect('transaction.id', 'transactionId')
      .where('transaction.spaceId = :spaceId', { spaceId })
      .andWhere('transaction.deletedAt IS NULL')
      .orderBy('transaction.categoryId', 'ASC')
      .addOrderBy('transaction.purchaseDate', 'DESC')
      .addOrderBy('transaction.id', 'DESC')
      .limit(activeCategories.length)
      .getRawMany<
        CategorySuggestionExample & {
          purchaseDate: string;
          transactionId: string;
        }
      >();

    return {
      categories: activeCategories,
      examples: examples.map(({ categoryId, description }) => ({
        categoryId,
        description,
      })),
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
