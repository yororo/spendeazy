import type { CategoryOverviewItem } from "./categories-service";

function filterCategoriesByName(
  categories: readonly CategoryOverviewItem[],
  search: string,
) {
  const normalizedSearch = search.trim().toLocaleLowerCase();

  return categories.filter(
    (category) =>
      !normalizedSearch ||
      category.name.toLocaleLowerCase().includes(normalizedSearch),
  );
}

export { filterCategoriesByName };
