import type { CategoryRecord } from '../application/category-store';
import { resolveCategoryColor } from '../application/category-color';
import { CategoryResponseDto } from './category-response.dto';

export function toSpaceCategoryResponse(
  category: CategoryRecord,
): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    iconKey: category.iconKey,
    colorKey: resolveCategoryColor(category.id, category.color),
    isActive: category.isActive,
    revision: category.revision,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
