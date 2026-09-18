/**
 * Normalizes text used for locale-independent matching.
 *
 * Deliberately avoids compatibility normalization so that visually similar
 * characters remain distinct matching values.
 */
export function normalizeMatchingText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}
