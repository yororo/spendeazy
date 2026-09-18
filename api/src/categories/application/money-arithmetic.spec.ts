import { normalizeMoney, subtractMoney } from './money-arithmetic';

describe('money arithmetic', () => {
  it('subtracts decimal strings and preserves negative remaining values', () => {
    expect(subtractMoney('10.00', '12.35')).toBe('-2.35');
  });

  it('canonicalizes database numeric results to two decimal places', () => {
    expect(normalizeMoney('0')).toBe('0.00');
    expect(normalizeMoney('12.5')).toBe('12.50');
    expect(normalizeMoney('12.50')).toBe('12.50');
  });
});
