import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { TransactionsService } from '../application/transactions.service';
import type { ManualTransactionRecord } from '../application/transaction-store';
import { SpaceTransactionsController } from './space-transactions.controller';

describe('SpaceTransactionsController', () => {
  it('checks membership and exposes immutable creator attribution on history rows', async () => {
    const transaction = transactionRecord({ addedByUserId: '8' });
    const transactionsService = {
      listTransactionsInSpace: jest.fn().mockResolvedValue({
        items: [transaction],
        nextCursor: null,
      }),
    };
    const spaceAccessService = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceTransactionsController(
      transactionsService as unknown as TransactionsService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.listTransactions(
        authenticatedRequest('7'),
        { spaceId: '10' },
        {},
      ),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: '100',
          source: 'manual',
          addedByUserId: '8',
          statementImportId: null,
        }),
      ],
      nextCursor: null,
    });

    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
    expect(transactionsService.listTransactionsInSpace).toHaveBeenCalledWith(
      '10',
      {},
    );
  });

  it('uses equal Space write access for creation and maps the scoped Location', async () => {
    const transaction = transactionRecord({ addedByUserId: '7' });
    const transactionsService = {
      createManualTransactionInSpace: jest.fn().mockResolvedValue(transaction),
    };
    const spaceAccessService = {
      requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const status = jest.fn();
    const setHeader = jest.fn();
    const controller = new SpaceTransactionsController(
      transactionsService as unknown as TransactionsService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.createTransaction(
        authenticatedRequest('7'),
        { spaceId: '10' },
        {
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
          categoryId: '42',
        },
        { status, setHeader } as unknown as Response,
      ),
    ).resolves.toEqual(expect.objectContaining({ addedByUserId: '7' }));

    expect(spaceAccessService.requireWriteAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
    expect(
      transactionsService.createManualTransactionInSpace,
    ).toHaveBeenCalledWith('7', '10', {
      purchaseDate: '2026-08-01',
      description: 'Coffee',
      amount: '4.50',
      categoryId: '42',
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/spaces/10/transactions/100',
    );
  });

  it('passes the authoritative version for edits and If-Match for deletes', async () => {
    const transaction = transactionRecord();
    const transactionsService = {
      updateTransactionInSpace: jest.fn().mockResolvedValue(transaction),
      deleteManualTransactionInSpace: jest.fn().mockResolvedValue(undefined),
    };
    const spaceAccessService = {
      requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceTransactionsController(
      transactionsService as unknown as TransactionsService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await controller.updateTransaction(
      authenticatedRequest('7'),
      { spaceId: '10', transactionId: '100' },
      {
        description: 'Dinner',
        updatedAt: transaction.updatedAt.toISOString(),
      },
    );
    await controller.deleteTransaction(
      authenticatedRequest('7'),
      { spaceId: '10', transactionId: '100' },
      `W/"${transaction.updatedAt.toISOString()}"`,
    );

    expect(transactionsService.updateTransactionInSpace).toHaveBeenCalledWith(
      '10',
      '100',
      {
        description: 'Dinner',
        expectedUpdatedAt: transaction.updatedAt.toISOString(),
      },
    );
    expect(
      transactionsService.deleteManualTransactionInSpace,
    ).toHaveBeenCalledWith('10', '100', transaction.updatedAt.toISOString());
  });

  it('rejects Space writes without a concurrency version', async () => {
    const transactionsService = {
      updateTransactionInSpace: jest.fn(),
      deleteManualTransactionInSpace: jest.fn(),
    };
    const spaceAccessService = {
      requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceTransactionsController(
      transactionsService as unknown as TransactionsService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.updateTransaction(
        authenticatedRequest('7'),
        { spaceId: '10', transactionId: '100' },
        { description: 'Dinner' } as never,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        expect.objectContaining({ field: '/updatedAt', code: 'required' }),
      ],
    });
    await expect(
      controller.deleteTransaction(authenticatedRequest('7'), {
        spaceId: '10',
        transactionId: '100',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [
        expect.objectContaining({
          field: '/headers/if-match',
          code: 'required',
        }),
      ],
    });
    expect(transactionsService.updateTransactionInSpace).not.toHaveBeenCalled();
    expect(
      transactionsService.deleteManualTransactionInSpace,
    ).not.toHaveBeenCalled();
  });
});

function transactionRecord(
  overrides: Partial<ManualTransactionRecord> = {},
): ManualTransactionRecord {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '100',
    userId: '7',
    spaceId: '10',
    addedByUserId: '7',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function authenticatedRequest(userId: string): AuthenticatedRequest {
  return { authenticatedUserId: userId } as AuthenticatedRequest;
}
