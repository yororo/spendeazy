import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type {
  ListTransactionsInput,
  TransactionsService,
} from '../application/transactions.service';
import type {
  ManualTransactionRecord,
  TransactionRecord,
} from '../application/transaction-store';
import type { TransactionActivityRecord } from '../application/transaction-activity-store';
import { TransactionsController } from './transactions.controller';

describe('TransactionsController', () => {
  it('returns a created manual transaction with canonical Location and API encodings', async () => {
    const transaction = transactionRecord();
    const transactionsService = {
      createManualTransactionInSpace: jest.fn().mockResolvedValue(transaction),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      personalSpaceAccess(),
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
      listTransactionsInSpace: jest.fn().mockResolvedValue({
        items: [transaction],
        nextCursor: 'next-page',
      }),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      personalSpaceAccess(),
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

    expect(transactionsService.listTransactionsInSpace).toHaveBeenCalledWith(
      '9',
      query,
    );
  });

  it('lists retained deleted Transactions through the Personal Space boundary', async () => {
    const deletedAt = new Date('2026-09-20T00:01:00.000Z');
    const transaction = transactionRecord();
    const transactionsService = {
      listDeletedTransactionsInSpace: jest.fn().mockResolvedValue({
        items: [{ ...transaction, deletedAt }],
        nextCursor: null,
      }),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listDeletedTransactions(authenticatedRequest(), {}),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: '100',
          source: 'manual',
          deletedAt: deletedAt.toISOString(),
        }),
      ],
      nextCursor: null,
    });

    expect(
      transactionsService.listDeletedTransactionsInSpace,
    ).toHaveBeenCalledWith('9', {});
  });

  it('maps imported transaction history with its statement relationship and nullable category', async () => {
    const transaction = importedTransactionRecord();
    transaction.categoryId = null;
    const transactionsService = {
      listTransactionsInSpace: jest.fn().mockResolvedValue({
        items: [transaction],
        nextCursor: null,
      }),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      personalSpaceAccess(),
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

  it('authorizes the Personal Space before returning Transaction activity', async () => {
    const listTransactionActivityInSpace = jest
      .fn()
      .mockResolvedValue([activityRecord()]);
    const transactionsService = {
      listTransactionActivityInSpace,
    };
    const requirePersonalSpace = jest.fn().mockResolvedValue({ id: '9' });
    const spaceAccessService = {
      requirePersonalSpace,
      requirePersonalWriteSpace: jest.fn().mockResolvedValue({ id: '9' }),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      spaceAccessService,
    );

    await expect(
      controller.listTransactionActivity(authenticatedRequest(), {
        transactionId: '100',
      }),
    ).resolves.toEqual([
      {
        id: '200',
        transactionId: '100',
        type: 'created',
        actorUserId: '8',
        occurredAt: '2026-08-29T00:00:00.123Z',
      },
    ]);

    expect(requirePersonalSpace).toHaveBeenCalledWith('7');
    expect(listTransactionActivityInSpace).toHaveBeenCalledWith('9', '100');
  });

  it('returns before-and-after values for an edited activity event', async () => {
    const transactionsService = {
      listTransactionActivityInSpace: jest
        .fn()
        .mockResolvedValue([editedActivityRecord()]),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listTransactionActivity(authenticatedRequest(), {
        transactionId: '100',
      }),
    ).resolves.toEqual([
      {
        id: '201',
        transactionId: '100',
        type: 'edited',
        actorUserId: '8',
        occurredAt: '2026-09-20T00:00:00.123Z',
        before: {
          categoryId: '42',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
        after: {
          categoryId: '43',
          purchaseDate: '2026-08-01',
          description: 'Dinner',
          amount: '4.50',
        },
      },
    ]);
  });

  it('maps a deletion activity without inventing an after-state', async () => {
    const transactionsService = {
      listTransactionActivityInSpace: jest.fn().mockResolvedValue([
        {
          id: '202',
          transactionId: '100',
          spaceId: '9',
          actorUserId: '8',
          type: 'deleted' as const,
          occurredAt: new Date('2026-09-20T00:02:00.000Z'),
        },
      ]),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      personalSpaceAccess(),
    );

    await expect(
      controller.listTransactionActivity(authenticatedRequest(), {
        transactionId: '100',
      }),
    ).resolves.toEqual([
      {
        id: '202',
        transactionId: '100',
        type: 'deleted',
        actorUserId: '8',
        occurredAt: '2026-09-20T00:02:00.000Z',
      },
    ]);
  });

  it('returns an imported transaction after a category-only patch', async () => {
    const transaction = importedTransactionRecord();
    const transactionsService = {
      updateTransactionInSpace: jest.fn().mockResolvedValue(transaction),
    };
    const controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
      personalSpaceAccess(),
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

    expect(transactionsService.updateTransactionInSpace).toHaveBeenCalledWith(
      '7',
      '9',
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
    deletedAt: null,
  };
}

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}

function personalSpaceAccess(): SpaceAccessService {
  return {
    requirePersonalSpace: jest.fn().mockResolvedValue({ id: '9' }),
    requirePersonalWriteSpace: jest.fn().mockResolvedValue({ id: '9' }),
  } as unknown as SpaceAccessService;
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
    deletedAt: null,
  };
}

function activityRecord(): TransactionActivityRecord {
  return {
    id: '200',
    transactionId: '100',
    spaceId: '9',
    actorUserId: '8',
    type: 'created',
    occurredAt: new Date('2026-08-29T00:00:00.123Z'),
  };
}

function editedActivityRecord(): TransactionActivityRecord {
  return {
    id: '201',
    transactionId: '100',
    spaceId: '9',
    actorUserId: '8',
    type: 'edited',
    occurredAt: new Date('2026-09-20T00:00:00.123Z'),
    before: {
      categoryId: '42',
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
    },
    after: {
      categoryId: '43',
      purchaseDate: '2026-08-01',
      description: 'Dinner',
      amount: '4.50',
    },
  };
}
