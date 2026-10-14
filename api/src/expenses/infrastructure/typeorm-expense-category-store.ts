import { Injectable, Optional } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import type {
  ExpenseCategoryRecord,
  ExpenseCategoryStore,
} from '../application/expense-category-store';

@Injectable()
export class TypeOrmExpenseCategoryStore implements ExpenseCategoryStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
    @Optional()
    private readonly lockCategory = false,
  ) {}

  async findBySpaceId(
    spaceId: string,
    id: string,
  ): Promise<ExpenseCategoryRecord | null> {
    const query = this.entityManager
      .getRepository(CategoryEntity)
      .createQueryBuilder('category')
      .where('category.id = :id', { id })
      .andWhere('category.space_id = :spaceId', { spaceId });
    if (this.lockCategory) {
      query.setLock('pessimistic_read');
    }

    const entity = await query.getOne();

    return entity
      ? {
          id: entity.id,
          spaceId: entity.spaceId,
          isActive: entity.isActive,
        }
      : null;
  }
}
