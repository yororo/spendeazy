import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateManualTransactionDto,
  TransactionCollectionQueryDto,
  UpdateManualTransactionDto,
} from './transaction.dto';

describe('manual transaction DTOs', () => {
  it('accepts a valid manual transaction with an optional category', async () => {
    const transaction = plainToInstance(CreateManualTransactionDto, {
      purchaseDate: '2026-08-01',
      description: '  Monthly rent  ',
      amount: '250.00',
      categoryId: '42',
    });

    await expect(validate(transaction)).resolves.toEqual([]);
    expect(transaction.description).toBe('Monthly rent');
  });

  it('accepts an Uncategorized transaction and a patch that clears its category', async () => {
    const transaction = plainToInstance(CreateManualTransactionDto, {
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
    });
    const patch = plainToInstance(UpdateManualTransactionDto, {
      categoryId: null,
    });

    await expect(validate(transaction)).resolves.toEqual([]);
    await expect(validate(patch)).resolves.toEqual([]);
  });

  it('rejects non-positive, imprecise, and oversized amounts', async () => {
    for (const amount of [
      '0.00',
      '-1.00',
      '1',
      '1.0',
      '1.000',
      '10000000000000.00',
    ]) {
      const transaction = plainToInstance(CreateManualTransactionDto, {
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount,
      });

      await expect(validate(transaction)).resolves.not.toEqual([]);
    }
  });

  it('rejects invalid calendar dates, blank descriptions, and an empty patch', async () => {
    for (const purchaseDate of ['2026-02-29', '2026-04-31', '08/01/2026']) {
      const transaction = plainToInstance(CreateManualTransactionDto, {
        purchaseDate,
        description: 'Coffee',
        amount: '4.50',
      });

      await expect(validate(transaction)).resolves.not.toEqual([]);
    }

    const blankDescription = plainToInstance(CreateManualTransactionDto, {
      purchaseDate: '2026-08-01',
      description: '   ',
      amount: '4.50',
    });
    const emptyPatch = plainToInstance(UpdateManualTransactionDto, {});

    await expect(validate(blankDescription)).resolves.not.toEqual([]);
    await expect(validate(emptyPatch)).resolves.not.toEqual([]);
  });

  it('accepts normalized transaction history filters and a bounded page size', async () => {
    const query = plainToInstance(TransactionCollectionQueryDto, {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      categoryId: '42',
      categoryState: 'categorized',
      statementImportId: '9',
      source: 'imported',
      pageSize: '25',
      cursor: 'opaque-cursor',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.pageSize).toBe(25);
  });

  it('rejects invalid history filters and reversed date bounds', async () => {
    const invalidQueries = [
      { fromDate: '2026-08-32' },
      { toDate: '08/31/2026' },
      { fromDate: '2026-09-01', toDate: '2026-08-01' },
      { categoryId: '0' },
      { categoryState: 'unknown' },
      { statementImportId: '0' },
      { source: 'all' },
      { pageSize: '0' },
      { pageSize: '101' },
      { pageSize: '2.5' },
    ];

    for (const input of invalidQueries) {
      await expect(
        validate(plainToInstance(TransactionCollectionQueryDto, input)),
      ).resolves.not.toEqual([]);
    }
  });

  it('rejects unknown history query fields', async () => {
    const query = plainToInstance(TransactionCollectionQueryDto, {
      category: '42',
    });

    await expect(
      validate(query, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'category',
        }),
      ]),
    );
  });
});
