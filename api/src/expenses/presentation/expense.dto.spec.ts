import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateManualExpenseDto,
  ExpenseCollectionQueryDto,
  UpdateManualExpenseDto,
} from './expense.dto';

describe('Expense DTOs', () => {
  it('requires a Category and normalizes manual Expense fields', async () => {
    const expense = plainToInstance(CreateManualExpenseDto, {
      expenseDate: '2026-08-01',
      description: '  Coffee  ',
      amount: '4.50',
      categoryId: '42',
    });
    await expect(validate(expense)).resolves.toEqual([]);
    expect(expense.description).toBe('Coffee');

    const missingCategory = plainToInstance(CreateManualExpenseDto, {
      expenseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
    });
    await expect(validate(missingCategory)).resolves.not.toEqual([]);
  });

  it('rejects invalid amounts, calendar dates, blank descriptions, and empty edits', async () => {
    for (const amount of [
      '0.00',
      '-1.00',
      '1',
      '1.0',
      '1.000',
      '10000000000000.00',
    ]) {
      const expense = plainToInstance(CreateManualExpenseDto, {
        expenseDate: '2026-08-01',
        description: 'Coffee',
        amount,
        categoryId: '42',
      });
      await expect(validate(expense)).resolves.not.toEqual([]);
    }

    for (const expenseDate of ['2026-02-29', '2026-04-31', '08/01/2026']) {
      const expense = plainToInstance(CreateManualExpenseDto, {
        expenseDate,
        description: 'Coffee',
        amount: '4.50',
        categoryId: '42',
      });
      await expect(validate(expense)).resolves.not.toEqual([]);
    }

    await expect(
      validate(plainToInstance(UpdateManualExpenseDto, {})),
    ).resolves.not.toEqual([]);
  });

  it('accepts supported filters and rejects legacy or malformed query fields', async () => {
    const query = plainToInstance(ExpenseCollectionQueryDto, {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      categoryId: '42',
      statementImportId: '9',
      source: 'imported',
      description: ' coffee ',
      pageSize: '25',
      cursor: 'opaque-cursor',
    });
    await expect(validate(query)).resolves.toEqual([]);
    expect(query.pageSize).toBe(25);
    expect(query.description).toBe('coffee');

    for (const input of [
      { fromDate: '2026-08-32' },
      { toDate: '08/31/2026' },
      { fromDate: '2026-09-01', toDate: '2026-08-01' },
      { categoryId: '0' },
      { statementImportId: '0' },
      { source: 'all' },
      { pageSize: '0' },
      { pageSize: '101' },
      { pageSize: '2.5' },
    ]) {
      await expect(
        validate(plainToInstance(ExpenseCollectionQueryDto, input)),
      ).resolves.not.toEqual([]);
    }

    for (const input of [
      { categoryState: 'uncategorized' },
      { accountBank: 'BDO' },
    ]) {
      await expect(
        validate(plainToInstance(ExpenseCollectionQueryDto, input), {
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      ).resolves.not.toEqual([]);
    }
  });

  it('rejects unknown query fields', async () => {
    await expect(
      validate(plainToInstance(ExpenseCollectionQueryDto, { category: '42' }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'category' }),
      ]),
    );
  });
});
