import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CommitReviewedStatementImportDto,
  ReviewedExpenseDto,
} from './statement-import.dto';

describe('Statement Import DTOs', () => {
  it('accepts canonical categorized Expense fields and trims descriptions', async () => {
    const input = plainToInstance(CommitReviewedStatementImportDto, {
      fileName: '  august.pdf  ',
      fileHash: 'a'.repeat(64),
      statementDate: '2026-08-31',
      statementType: 'credit_card',
      provider: '  Example Bank  ',
      accountFormat: '  visa  ',
      expenses: [
        {
          sourceRowId: 'row-1',
          categoryId: '42',
          expenseDate: '2026-08-01',
          description: '  Coffee  ',
          amount: '4.50',
        },
      ],
    });
    await expect(validate(input)).resolves.toEqual([]);
    expect(input.fileName).toBe('august.pdf');
    expect(input.provider).toBe('Example Bank');
    expect(input.expenses[0].description).toBe('Coffee');
  });

  it('rejects malformed hashes, dates, missing Expenses and missing Categories', async () => {
    const base = {
      fileName: 'august.pdf',
      fileHash: 'a'.repeat(64),
      statementDate: '2026-08-31',
      statementType: 'credit_card',
      provider: 'Example Bank',
      expenses: [],
    };
    for (const overrides of [
      { fileHash: 'A'.repeat(64) },
      { statementDate: '2026-02-29' },
      { expenses: undefined },
      {
        expenses: [
          {
            expenseDate: '2026-08-01',
            description: 'Coffee',
            amount: '4.50',
          },
        ],
      },
    ]) {
      await expect(
        validate(
          plainToInstance(CommitReviewedStatementImportDto, {
            ...base,
            ...overrides,
          }),
        ),
      ).resolves.not.toEqual([]);
    }
  });

  it('accepts an E-Wallet history interval, Total Debit and optional reference', async () => {
    const input = plainToInstance(CommitReviewedStatementImportDto, {
      fileName: 'wallet-export.pdf',
      fileHash: 'a'.repeat(64),
      statementType: 'e_wallet',
      provider: 'GCash',
      accountFormat: 'E-Wallet',
      historyFromDate: '2026-08-09',
      historyToDate: '2026-08-31',
      totalDebit: '26696.92',
      expenses: [
        {
          sourceRowId: 'row-1',
          categoryId: '42',
          expenseDate: '2026-08-09',
          description: 'Payment to Cafe',
          amount: '10.00',
          reference: ' 123456789 ',
        },
      ],
    });
    await expect(validate(input)).resolves.toEqual([]);
    expect(input.expenses[0].reference).toBe('123456789');
  });

  it('rejects incomplete E-Wallet controls and unsupported extra fields', async () => {
    const missingBounds = plainToInstance(CommitReviewedStatementImportDto, {
      fileName: 'wallet-export.pdf',
      fileHash: 'a'.repeat(64),
      statementType: 'e_wallet',
      provider: 'GCash',
      totalDebit: '10.00',
      expenses: [],
    });
    await expect(validate(missingBounds)).resolves.toEqual([]);

    const invalidExpense = plainToInstance(ReviewedExpenseDto, {
      categoryId: null,
      expenseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
    });
    await expect(validate(invalidExpense)).resolves.not.toEqual([]);
  });
});
