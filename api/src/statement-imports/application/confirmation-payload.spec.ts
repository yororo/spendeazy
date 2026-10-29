import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ConfirmationPayload } from './confirmation-payload';
import {
  validateConfirmationCategories,
  validateConfirmationPayload,
} from './validate-confirmation-payload';
import {
  confirmationRequestHash,
  protectConfirmationReferences,
  warningDigest,
  warningIdentity,
} from './confirmation-canonicalization';
import { NodeGCashReferenceHasher } from '../infrastructure/node-gcash-reference-hasher';
import { ConfirmationPayloadDto } from '../presentation/confirmation-payload.dto';

const now = new Date('2026-10-29T16:00:00.000Z'); // October 30 in Manila.
const hasher = new NodeGCashReferenceHasher('fictional-key');
function fixture(): ConfirmationPayload {
  return JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../mobile-app/src/features/statement-import/fixtures/confirmation.json',
      ),
      'utf8',
    ),
  ) as ConfirmationPayload;
}
const checked = () => validateConfirmationPayload(fixture(), now);

describe('complete reviewed import contract', () => {
  it('accepts the actual mobile golden serializer output including every locked row and unparseable control', async () => {
    const value = checked();
    expect(value.expenses.map((row) => row.amount)).toEqual([
      '1000.00',
      '300.00',
    ]);
    expect(value.evidence.transactions).toHaveLength(10);
    expect(value.evidence.controlTotals[1]).toMatchObject({
      originalText: 'unreadable',
      amount: null,
    });
    expect(value.evidence.reconciliation.comparisons[0]).toMatchObject({
      expectedAmount: '10000.00',
      extractedAmount: '9500.00',
      difference: '-500.00',
    });
    expect(
      await validate(plainToInstance(ConfirmationPayloadDto, value), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
  });

  it.each([
    (p: ConfirmationPayload) => {
      p.expenses = [];
    },
    (p: ConfirmationPayload) => {
      p.expenses.push(p.expenses[0]);
    },
    (p: ConfirmationPayload) => {
      p.excluded.pop();
    },
    (p: ConfirmationPayload) => {
      p.excluded.push({
        sourceRowId: p.expenses[0].sourceRowId,
        reason: 'manual',
        automatic: false,
      });
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].sourceRowId = 'unknown';
    },
    (p: ConfirmationPayload) => {
      p.evidence.transactions[0].classification = 'payment';
    },
    (p: ConfirmationPayload) => {
      p.evidence.transactions.push(p.evidence.transactions[0]);
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].amount = '1.001';
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].amount = '10000000000000.00';
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].amount = '0.00';
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].amount = '-1.00';
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].description = ' ';
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].expenseDate = '2026-10-31';
    },
    (p: ConfirmationPayload) => {
      p.expenses[0].expenseDate = '2026-02-29';
    },
    (p: ConfirmationPayload) => {
      p.statement.accountFormat = 'visa';
    },
    (p: ConfirmationPayload) => {
      p.statement.statementDate = '2026-09-30';
    },
    (p: ConfirmationPayload) => {
      p.statement.historyFromDate = '2026-10-01';
    },
    (p: ConfirmationPayload) => {
      p.evidence.reconciliation.comparisons[0].difference = '0.00';
    },
  ])(
    'rejects malformed dispositions, amounts, dates and metadata (%#)',
    (mutate) => {
      const value = fixture();
      mutate(value);
      expect(() => validateConfirmationPayload(value, now)).toThrow(
        'invalid fields',
      );
    },
  );

  it('uses Manila today and Gregorian leap dates and preserves the numeric(15,2) maximum', () => {
    const value = fixture();
    value.expenses[0].expenseDate = '2026-10-30';
    value.expenses[0].amount = '9999999999999.99';
    expect(validateConfirmationPayload(value, now).expenses[0].amount).toBe(
      '9999999999999.99',
    );
    value.expenses[0].expenseDate = '2024-02-29';
    expect(() => validateConfirmationPayload(value, now)).not.toThrow();
  });

  it.each([
    ['bdo', 'amex'],
    ['eastwest', 'visa'],
  ] as const)(
    'accepts only the exact %s card tuple',
    (provider, accountFormat) => {
      const value = fixture();
      Object.assign(value.statement, {
        provider,
        accountFormat,
        statementType: 'credit_card',
        statementDate: '2026-09-30',
        historyFromDate: null,
        historyToDate: null,
      });
      value.evidence.transactions.forEach((row) => {
        delete row.duplicateReference;
      });
      expect(() => validateConfirmationPayload(value, now)).not.toThrow();
    },
  );

  it('rejects unknown fields at every nested boundary and keeps their names/values out of errors', async () => {
    for (const select of [
      (p: ConfirmationPayload) => p,
      (p: ConfirmationPayload) => p.statement,
      (p: ConfirmationPayload) => p.evidence,
      (p: ConfirmationPayload) => p.evidence.transactions[0].original,
      (p: ConfirmationPayload) => p.evidence.reconciliation,
      (p: ConfirmationPayload) => p.evidence.pages[0],
      (p: ConfirmationPayload) => p.rememberedRules[0],
    ]) {
      const value = fixture();
      Object.assign(select(value), { privatePassword: 'private-secret' });
      expect(() => validateConfirmationPayload(value, now)).toThrow();
      const errors = await validate(
        plainToInstance(ConfirmationPayloadDto, value),
        {
          whitelist: true,
          forbidNonWhitelisted: true,
          validationError: { target: false, value: false },
        },
      );
      expect(errors.length).toBeGreaterThan(0);
    }
    const value = fixture();
    value.evidence.reconciliation.diagnostics[0].message =
      'Private statement text';
    expect(() => validateConfirmationPayload(value, now)).toThrow();
    value.expenses[0].description = 'Card 4111 1111 1111 1111';
    expect(() => validateConfirmationPayload(value, now)).toThrow();
  });

  it('checks remembered Rule targets even if their originating row was excluded', async () => {
    const value = checked();
    value.rememberedRules[0].categoryId = '99';
    const find = jest.fn((id: string) =>
      Promise.resolve({ isActive: id === '42' }),
    );
    await expect(validateConfirmationCategories(value, find)).rejects.toThrow();
    expect(find.mock.calls.map((call) => call[0])).toEqual(['42', '99']);
  });

  it('replaces raw references with existing scoped HMAC before any canonical hash or snapshot', () => {
    const value = checked();
    const protectedValue = protectConfirmationReferences(value, '8', hasher);
    const encoded = JSON.stringify(protectedValue);
    expect(encoded).not.toContain('duplicateReference');
    expect(encoded).not.toContain('fictional-ref-');
    expect(protectedValue.evidence.transactions[0].referenceHash).toBe(
      hasher.hash({
        spaceId: '8',
        provider: 'gcash',
        reference: 'fictional-ref-0',
      }),
    );
    expect(value.evidence.transactions[0].duplicateReference).toBe(
      'fictional-ref-0',
    );
  });

  it('binds request hash to acknowledgment while warning digest excludes it, and binds both to all evidence/Space', () => {
    const value = protectConfirmationReferences(checked(), '8', hasher);
    const digest = warningDigest('8', value, []);
    const hash = confirmationRequestHash('8', value);
    const acknowledged = {
      ...value,
      acknowledgedWarnings: ['warning-a'],
      acknowledgedWarningDigest: digest,
    };
    expect(warningDigest('8', acknowledged, [])).toBe(digest);
    expect(confirmationRequestHash('8', acknowledged)).not.toBe(hash);
    expect(warningDigest('9', value, [])).not.toBe(digest);
    const edited = structuredClone(value);
    edited.evidence.transactions[2].original.amountText = '-5001.00';
    expect(warningDigest('8', edited, [])).not.toBe(digest);
    expect(confirmationRequestHash('8', edited)).not.toBe(hash);
    const warning = {
      type: 'probable_duplicate' as const,
      sourceRowIds: ['b', 'a'],
      expenseIds: ['2', '1'],
      statementImportIds: [],
    };
    expect(warningIdentity(warning)).toBe(
      warningIdentity({
        ...warning,
        sourceRowIds: ['a', 'b'],
        expenseIds: ['1', '2'],
      }),
    );
    expect(
      warningIdentity(warning, [
        { code: 'missing-control', sourceRowIds: [], pageIndices: [1] },
      ]),
    ).not.toBe(warningIdentity(warning));
    const warnings = [
      { ...warning, id: warningIdentity(warning), message: 'Display text' },
    ];
    expect(warningDigest('8', value, warnings)).toBe(
      warningDigest('8', value, [
        {
          ...warnings[0],
          message: 'Renamed',
          sourceRowIds: ['a', 'b'],
          expenseIds: ['1', '2'],
        },
      ]),
    );
    expect(warningDigest('8', value, warnings)).not.toBe(digest);
  });
});
