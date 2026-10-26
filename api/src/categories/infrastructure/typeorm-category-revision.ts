import type { EntityManager } from 'typeorm';
import { CategoryEntity } from '../../database/entities/category.entity';

export const CATEGORY_REVISION_INCREMENT = () => 'revision + 1';

export async function bumpCategoryRevision(
  entityManager: EntityManager,
  categoryId: string,
): Promise<void> {
  await entityManager
    .getRepository(CategoryEntity)
    .createQueryBuilder()
    .update(CategoryEntity)
    .set({ revision: CATEGORY_REVISION_INCREMENT })
    .where('id = :categoryId', { categoryId })
    .execute();
}
