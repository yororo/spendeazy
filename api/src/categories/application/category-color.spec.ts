import {
  CATEGORY_COLORS,
  getDefaultCategoryColor,
  isCategoryColor,
  resolveCategoryColor,
} from './category-color';

describe('Category Color palette', () => {
  it('contains exactly 24 distinct named choices without black, white, or hex entries', () => {
    expect(CATEGORY_COLORS).toHaveLength(24);
    expect(new Set(CATEGORY_COLORS).size).toBe(24);
    expect(CATEGORY_COLORS).not.toContain('black');
    expect(CATEGORY_COLORS).not.toContain('white');
    expect(CATEGORY_COLORS.every((color) => !color.startsWith('#'))).toBe(true);
  });

  it('validates only supported palette identifiers', () => {
    expect(isCategoryColor('teal')).toBe(true);
    expect(isCategoryColor('#ffffff')).toBe(false);
    expect(isCategoryColor('white')).toBe(false);
    expect(isCategoryColor(null)).toBe(false);
  });

  it('resolves legacy defaults deterministically from Category identity', () => {
    expect(getDefaultCategoryColor('42')).toBe('plum');
    expect(getDefaultCategoryColor('43')).toBe('violet');
    expect(getDefaultCategoryColor('42')).not.toBe(
      getDefaultCategoryColor('43'),
    );
    expect(resolveCategoryColor('42', null)).toBe('plum');
  });

  it('prefers the saved color over the identity-based default', () => {
    expect(resolveCategoryColor('42', 'teal')).toBe('teal');
  });
});
