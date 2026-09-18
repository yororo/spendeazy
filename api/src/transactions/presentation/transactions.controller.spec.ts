import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type {
  ListTransactionsInput,
  TransactionsService,
} from '../application/transactions.service';
import type {
  ManualTransactionRecord,
  TransactionRecord,
} from '../application/transaction-store';
import { TransactionsController } from './transactions.controller';

describe('TransactionsController', () => {
  it('returns a created manual transaction with canonical Location and API encodings', async () => {
    const transaction = transactionRecord();
    const transactionsService = {
      createManualTransaction: jest.fn().mockResolvedValue(transaction),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await expect(
      controller.createManualTransaction(
        authenticatedRequest(),
        {
          categoryId: '42',
          purchaseDate: transaction.purchaseDate,
          description: transaction.description,
          amount: transaction.amount,
        },
        response,
      ),
    ).resolves.toEqual({
      id: '100',
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      source: 'manual',
      createdAt: '2026-08-29T00:00:00.123Z',
      updatedAt: '2026-08-29T00:00:00.456Z',
    });

    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/transactions/100',
    );
  });

  it('maps a transaction history page without changing the service query', async () => {
    const transaction = transactionRecord();
    const query: ListTransactionsInput = {
      fromDate: '2026-08-01',
      pageSize: 10,
    };
    const transactionsService = {
      listTransactions: jest.fn().mockResolvedValue({
        items: [transaction],
        nextCursor: 'next-page',
      }),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
    );

    await expect(
      controller.listTransactions(authenticatedRequest(), query),
    ).resolves.toEqual({
      items: [
        {
          id: '100',
          categoryId: '42',
          statementImportId: null,
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          source: 'manual',
          createdAt: '2026-08-29T00:00:00.123Z',
          updatedAt: '2026-08-29T00:00:00.456Z',
        },
      ],
      nextCursor: 'next-page',
    });

    expect(transactionsService.listTransactions).toHaveBeenCalledWith(
      '7',
      query,
    );
  });

  it('maps imported transaction history with its statement relationship and nullable category', async () => {
    const transaction = importedTransactionRecord();
    transaction.categoryId = null;
    const transactionsService = {
      listTransactions: jest.fn().mockResolvedValue({
        items: [transaction],
        nextCursor: null,
      }),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
    );

    await expect(
      controller.listTransactions(authenticatedRequest(), {}),
    ).resolves.toEqual({
      items: [
        {
          id: '100',
          categoryId: null,
          statementImportId: '10',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          source: 'imported',
          createdAt: '2026-08-29T00:00:00.000Z',
          updatedAt: '2026-08-29T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('returns an imported transaction after a category-only patch', async () => {
    const transaction = importedTransactionRecord();
    const transactionsService = {
      updateTransaction: jest.fn().mockResolvedValue(transaction),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
    );

    await expect(
      controller.updateTransaction(
        authenticatedRequest(),
        { transactionId: '100' },
        { categoryId: '43' },
      ),
    ).resolves.toEqual({
      id: '100',
      categoryId: '43',
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      source: 'imported',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z',
    });

    expect(transactionsService.updateTransaction).toHaveBeenCalledWith(
      '7',
      '100',
      { categoryId: '43' },
    );
  });
});

function transactionRecord(): ManualTransactionRecord {
  return {
    id: '100',
    userId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}

function importedTransactionRecord(): TransactionRecord {
  return {
    id: '100',
    userId: '7',
    categoryId: '43',
    statementImportId: '10',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'imported',
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
  };
}
