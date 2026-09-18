import { computeImportFingerprint } from './import-fingerprint';

describe('computeImportFingerprint', () => {
  it('computes the versioned fingerprint from the resolved compact tuple', () => {
    expect(
      computeImportFingerprint(
        {
          bank: '  Example   Bank ',
          cardType: '\tVISA\n',
        },
        {
          purchaseDate: '2026-08-01',
          description: '  Coffee\tShop  ',
          amount: '0004.50',
        },
      ),
    ).toBe('b9d8af3f0646ef13fcba3e3f16daefaf39cf57272e9f9d94bf943e66c351c08b');
  });
});
