export const CATEGORY_COLORS = [
  'coral',
  'scarlet',
  'crimson',
  'rose',
  'magenta',
  'orchid',
  'plum',
  'violet',
  'indigo',
  'cobalt',
  'azure',
  'sky',
  'cyan',
  'teal',
  'emerald',
  'forest',
  'lime',
  'olive',
  'gold',
  'amber',
  'copper',
  'cocoa',
  'slate',
  'steel',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

const CATEGORY_COLOR_SET: ReadonlySet<string> = new Set(CATEGORY_COLORS);

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === 'string' && CATEGORY_COLOR_SET.has(value);
}

export function getDefaultCategoryColor(categoryId: string): CategoryColor {
  let hash = 0;

  for (const character of categoryId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

export function resolveCategoryColor(
  categoryId: string,
  savedColor: CategoryColor | null | undefined,
): CategoryColor {
  return savedColor ?? getDefaultCategoryColor(categoryId);
}
