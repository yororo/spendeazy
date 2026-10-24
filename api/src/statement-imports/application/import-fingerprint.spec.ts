import { computeImportFingerprint } from './import-fingerprint';

describe('computeImportFingerprint', () => {
  it('computes the versioned digest from canonical provider, account and Expense fields', () => {
    expect(
      computeImportFingerprint(
        { provider: '  Example   Bank ', accountFormat: '\tVISA\n' },
        {
          expenseDate: '2026-08-01',
          description: '  Coffee\tShop  ',
          amount: '0004.50',
        },
      ),
    ).toMatch(/^[0-9a-f]{64}$/u);
  });
});
