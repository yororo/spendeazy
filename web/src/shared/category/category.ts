import type { CategoryCatalogItem } from "./category-catalog";
import { resolveCategoryColor, type CategoryColor } from "./category-colors";

type CategoryKey =
  | "housing"
  | "groceries"
  | "transport"
  | "dining"
  | "utilities"
  | "subscriptions"
  | "health"
  | "shopping"
  | "entertainment"
  | "travel"
  | "other";

interface CategoryProjection {
  readonly key: CategoryKey;
  readonly label: string;
  readonly color: CategoryColor | null;
}

const categoryKeyByName: Readonly<Record<string, CategoryKey>> = {
  housing: "housing",
  groceries: "groceries",
  transport: "transport",
  dining: "dining",
  "dining out": "dining",
  utilities: "utilities",
  subscriptions: "subscriptions",
  health: "health",
  shopping: "shopping",
  entertainment: "entertainment",
  travel: "travel",
  other: "other",
};

function getCategoryKeyFromName(name: string): CategoryKey {
  return categoryKeyByName[name.trim().toLocaleLowerCase()] ?? "other";
}

function projectCategoryCatalog(
  categories: readonly CategoryCatalogItem[],
): ReadonlyMap<string, CategoryProjection> {
  return new Map(
    categories.map(
      (category): [string, CategoryProjection] => [
        category.id,
        {
          key: getCategoryKeyFromName(category.name),
          label: category.name,
          color: resolveCategoryColor(category.id, category.color),
        },
      ],
    ),
  );
}

function resolveTransactionCategory(
  transactionId: string,
  categoryId: string | null,
  categoryById: ReadonlyMap<string, CategoryProjection>,
  createError: (message: string) => Error,
): CategoryProjection {
  if (categoryId === null) {
    return { key: "other", label: "Uncategorized", color: null };
  }

  const category = categoryById.get(categoryId);
  if (!category) {
    throw createError(
      `Transaction ${transactionId} references missing Category ${categoryId}.`,
    );
  }

  return category;
}

export {
  getCategoryKeyFromName,
  projectCategoryCatalog,
  resolveTransactionCategory,
};
export type { CategoryKey, CategoryProjection };
