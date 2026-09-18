import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CommitReviewedStatementImportDto,
  StatementImportCollectionQueryDto,
  StatementImportParamsDto,
} from './statement-import.dto';

describe('statement import DTOs', () => {
  it('accepts positive decimal string identifiers for statement-import routes', async () => {
    await expect(
      validate(
        plainToInstance(StatementImportParamsDto, {
          statementImportId: '108',
        }),
      ),
    ).resolves.toEqual([]);

    await expect(
      validate(
        plainToInstance(StatementImportParamsDto, {
          statementImportId: '1.5',
        }),
      ),
    ).resolves.not.toEqual([]);
  });

  it('accepts a reviewed statement and transforms display text', async () => {
    const input = plainToInstance(CommitReviewedStatementImportDto, {
      fileName: '  august.pdf  ',
      fileHash: 'a'.repeat(64),
      statementDate: '2026-08-31',
      bank: '  Example Bank  ',
      cardType: '  visa  ',
      transactions: [
        {
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: '  Coffee  ',
          amount: '4.50',
          categoryMatchConfidence: '0.9000',
        },
      ],
    });

    await expect(validate(input)).resolves.toEqual([]);
    expect(input.fileName).toBe('august.pdf');
    expect(input.bank).toBe('Example Bank');
    expect(input.transactions[0].description).toBe('Coffee');
  });

  it('rejects uppercase hashes, invalid dates, and missing transactions', async () => {
    for (const overrides of [
      { fileHash: 'A'.repeat(64) },
      { statementDate: '2026-02-29' },
      { transactions: undefined },
    ]) {
      const input = plainToInstance(CommitReviewedStatementImportDto, {
        fileName: 'august.pdf',
        fileHash: 'a'.repeat(64),
        statementDate: '2026-08-31',
        bank: 'Example Bank',
        transactions: [
          {
            purchaseDate: '2026-08-01',
            description: 'Coffee',
            amount: '4.50',
          },
        ],
        ...overrides,
      });

      await expect(validate(input)).resolves.not.toEqual([]);
    }
  });

  it('accepts an explicit boolean probable-duplicate acknowledgement only', async () => {
    const input = plainToInstance(CommitReviewedStatementImportDto, {
      fileName: 'august.pdf',
      fileHash: 'a'.repeat(64),
      statementDate: '2026-08-31',
      bank: 'Example Bank',
      transactions: [],
      acknowledgeProbableDuplicates: true,
    });

    await expect(validate(input)).resolves.toEqual([]);
    expect(input.acknowledgeProbableDuplicates).toBe(true);

    const invalidInput = plainToInstance(CommitReviewedStatementImportDto, {
      fileName: 'august.pdf',
      fileHash: 'a'.repeat(64),
      statementDate: '2026-08-31',
      bank: 'Example Bank',
      transactions: [],
      acknowledgeProbableDuplicates: 'true',
    });

    await expect(validate(invalidInput)).resolves.not.toEqual([]);
  });

  it('accepts bounded statement-import history filters and transforms page size', async () => {
    const query = plainToInstance(StatementImportCollectionQueryDto, {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      pageSize: '25',
      cursor: 'opaque-cursor',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.pageSize).toBe(25);
  });

  it('rejects invalid history dates, reversed bounds, and unknown query fields', async () => {
    for (const input of [
      { fromDate: '2026-08-32' },
      { toDate: '08/31/2026' },
      { fromDate: '2026-09-01', toDate: '2026-08-01' },
      { pageSize: '0' },
      { pageSize: '101' },
      { pageSize: '2.5' },
    ]) {
      await expect(
        validate(plainToInstance(StatementImportCollectionQueryDto, input)),
      ).resolves.not.toEqual([]);
    }

    await expect(
      validate(
        plainToInstance(StatementImportCollectionQueryDto, {
          statementDate: '2026-08-31',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'statementDate' }),
      ]),
    );
  });
});
