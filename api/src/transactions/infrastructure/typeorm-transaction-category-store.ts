import { Injectable, Optional } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';
import type {
  TransactionCategoryRecord,
  TransactionCategoryStore,
} from '../application/transaction-category-store';

@Injectable()
export class TypeOrmTransactionCategoryStore implements TransactionCategoryStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
    @Optional()
    private readonly lockCategory = false,
  ) {}

  async findById(
    userId: string,
    id: string,
  ): Promise<TransactionCategoryRecord | null> {
    const query = this.entityManager
      .getRepository(CategoryEntity)
      .createQueryBuilder('category')
      .where('category.id = :id', { id })
      .andWhere('category.user_id = :userId', { userId });
    if (this.lockCategory) {
      query.setLock('pessimistic_read');
    }

    const entity = await query.getOne();

    return entity
      ? {
          id: entity.id,
          userId: entity.userId,
          isActive: entity.isActive,
        }
      : null;
  }
}
