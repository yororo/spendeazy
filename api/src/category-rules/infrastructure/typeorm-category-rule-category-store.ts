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

  async findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<CategoryRuleCategoryRecord | null> {
    const entity = await this.entityManager
      .getRepository(CategoryEntity)
      .findOne({ where: { id, spaceId } });

    return entity
      ? {
          id: entity.id,
          spaceId: entity.spaceId,
          isActive: entity.isActive,
        }
      : null;
  }
}
