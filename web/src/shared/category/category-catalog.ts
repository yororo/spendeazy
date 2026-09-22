import { isCategoryColor, type CategoryColor } from "./category-colors";

interface CategoryCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly color?: CategoryColor | null;
  readonly isActive: boolean;
  readonly createdAt?: string;
  readonly updatedAt: string;
}

const CATEGORY_ID_PATTERN = /^[1-9]\d*$/u;

function isCategoryCatalogItem(value: unknown): value is CategoryCatalogItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    CATEGORY_ID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    value.name.length >= 1 &&
    value.name.length <= 100 &&
    value.name.trim().length > 0 &&
    (value.description === null || typeof value.description === "string") &&
    (value.description === null || value.description.length <= 500) &&
    (value.color === undefined ||
      value.color === null ||
      isCategoryColor(value.color)) &&
    typeof value.isActive === "boolean" &&
    (value.createdAt === undefined || typeof value.createdAt === "string") &&
    typeof value.updatedAt === "string"
  );
}

function isCategoryCatalog(value: unknown): value is readonly CategoryCatalogItem[] {
  return Array.isArray(value) && value.every(isCategoryCatalogItem);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { isCategoryCatalog, isCategoryCatalogItem };
export type { CategoryCatalogItem };
