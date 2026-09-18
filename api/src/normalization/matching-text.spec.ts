import { normalizeMatchingText } from './matching-text';

describe('normalizeMatchingText', () => {
  it('trims Unicode whitespace, lowercases, and collapses whitespace runs', () => {
    expect(
      normalizeMatchingText('\u2003  Green\u00a0\t\n Market  \u3000'),
    ).toBe('green market');
  });

  it('does not apply compatibility normalization', () => {
    expect(normalizeMatchingText('  ＧＲＥＥＮ  MARKET  ')).toBe(
      'ｇｒｅｅｎ market',
    );
  });
});
