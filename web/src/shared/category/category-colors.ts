const CATEGORY_COLOR_OPTIONS = [
  { value: "coral", label: "Coral", className: "bg-category-coral" },
  { value: "scarlet", label: "Scarlet", className: "bg-category-scarlet" },
  { value: "crimson", label: "Crimson", className: "bg-category-crimson" },
  { value: "rose", label: "Rose", className: "bg-category-rose" },
  { value: "magenta", label: "Magenta", className: "bg-category-magenta" },
  { value: "orchid", label: "Orchid", className: "bg-category-orchid" },
  { value: "plum", label: "Plum", className: "bg-category-plum" },
  { value: "violet", label: "Violet", className: "bg-category-violet" },
  { value: "indigo", label: "Indigo", className: "bg-category-indigo" },
  { value: "cobalt", label: "Cobalt", className: "bg-category-cobalt" },
  { value: "azure", label: "Azure", className: "bg-category-azure" },
  { value: "sky", label: "Sky", className: "bg-category-sky" },
  { value: "cyan", label: "Cyan", className: "bg-category-cyan" },
  { value: "teal", label: "Teal", className: "bg-category-teal" },
  { value: "emerald", label: "Emerald", className: "bg-category-emerald" },
  { value: "forest", label: "Forest", className: "bg-category-forest" },
  { value: "lime", label: "Lime", className: "bg-category-lime" },
  { value: "olive", label: "Olive", className: "bg-category-olive" },
  { value: "gold", label: "Gold", className: "bg-category-gold" },
  { value: "amber", label: "Amber", className: "bg-category-amber" },
  { value: "copper", label: "Copper", className: "bg-category-copper" },
  { value: "cocoa", label: "Cocoa", className: "bg-category-cocoa" },
  { value: "slate", label: "Slate", className: "bg-category-slate" },
  { value: "steel", label: "Steel", className: "bg-category-steel" },
] as const;

type CategoryColor = (typeof CATEGORY_COLOR_OPTIONS)[number]["value"];
const DEFAULT_CATEGORY_COLOR: CategoryColor = "coral";

const categoryColorValues = new Set<string>(
  CATEGORY_COLOR_OPTIONS.map((option) => option.value),
);

function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && categoryColorValues.has(value);
}

function getDefaultCategoryColor(categoryId: string): CategoryColor {
  let hash = 0;

  for (const character of categoryId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return CATEGORY_COLOR_OPTIONS[hash % CATEGORY_COLOR_OPTIONS.length].value;
}

function resolveCategoryColor(
  categoryId: string,
  savedColor: CategoryColor | null | undefined,
): CategoryColor {
  return savedColor ?? getDefaultCategoryColor(categoryId);
}

function getCategoryColorOption(color: CategoryColor) {
  return CATEGORY_COLOR_OPTIONS.find((option) => option.value === color)!;
}

export {
  CATEGORY_COLOR_OPTIONS,
  DEFAULT_CATEGORY_COLOR,
  getCategoryColorOption,
  getDefaultCategoryColor,
  isCategoryColor,
  resolveCategoryColor,
};
export type { CategoryColor };
