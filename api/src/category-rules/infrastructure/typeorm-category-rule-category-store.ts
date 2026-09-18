import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import type {
  CategoryRuleCategoryRecord,
  CategoryRuleCategoryStore,
} from '../application/category-rule-category-store';

@Injectable()
export class TypeOrmCategoryRuleCategoryStore implements CategoryRuleCategoryStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findById(
    userId: string,
    id: string,
  ): Promise<CategoryRuleCategoryRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryEntity)
      .findOne({ where: { id, userId } });

    return entity
      ? {
          id: entity.id,
          userId: entity.userId,
          isActive: entity.isActive,
        }
      : null;
  }
}
