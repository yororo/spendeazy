export const CATEGORY_ICON_KEYS = [
  'utensils',
  'car-front',
  'bus',
  'heart-pulse',
  'shopping-bag',
  'ticket',
  'plug-zap',
  'house',
  'shopping-basket',
  'heart-handshake',
  'shield-plus',
  'baby',
  'wrench',
  'smartphone',
  'shapes',
  'plane',
  'paw-print',
  'book-open',
  'dumbbell',
  'briefcase-business',
  'gift',
  'coffee',
  'wallet',
  'headphones',
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export const DEFAULT_CATEGORY_ICON_KEY: CategoryIconKey = 'shapes';

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return (
    typeof value === 'string' &&
    CATEGORY_ICON_KEYS.some((iconKey) => iconKey === value)
  );
}
