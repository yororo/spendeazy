import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { StatementImportsService } from '../application/statement-imports.service';
import type {
  StatementImportHistoryRecord,
  StatementImportRecord,
} from '../application/statement-import-store';
import { StatementImportsController } from './statement-imports.controller';

describe('StatementImportsController', () => {
  it('returns statement-import metadata and preserves nullable fields', async () => {
    const statementImport = statementImportRecord({
      id: '108',
      userId: '42',
      cardType: null,
    });
    const statementImportsService = {
      getStatementImport: jest.fn().mockResolvedValue(statementImport),
    };
    const controller = new StatementImportsController(
      statementImportsService as unknown as StatementImportsService,
    );

    await expect(
      controller.getStatementImport(authenticatedRequest(), {
        statementImportId: '108',
      }),
    ).resolves.toEqual({
      id: '108',
      fileName: 'august.pdf',
      statementDate: '2026-08-31',
      bank: 'Example Bank',
      cardType: null,
      importedAt: '2026-08-29T00:00:00.000Z',
    });

    expect(statementImportsService.getStatementImport).toHaveBeenCalledWith(
      '7',
      '108',
    );
  });

  it('returns the committed import without exposing its file hash', async () => {
    const statementImport = statementImportRecord();
    const statementImportsService = {
      commitReviewedStatementImport: jest
        .fn()
        .mockResolvedValue(statementImport),
    };
    const controller = new StatementImportsController(
      statementImportsService as unknown as StatementImportsService,
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await expect(
      controller.commitReviewedStatementImport(
        authenticatedRequest(),
        {
          fileName: statementImport.fileName,
          fileHash: statementImport.fileHash,
          statementDate: statementImport.statementDate,
          bank: statementImport.bank,
          cardType: statementImport.cardType,
          transactions: [],
        },
        response,
      ),
    ).resolves.toEqual({
      id: '100',
      fileName: 'august.pdf',
      statementDate: '2026-08-31',
      bank: 'Example Bank',
      cardType: 'visa',
      importedAt: '2026-08-29T00:00:00.000Z',
    });

    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/statement-imports/100',
    );
  });

  it('maps statement-import history with string counts without exposing internal fields', async () => {
    const statementImport = statementImportHistoryRecord();
    const query = { fromDate: '2026-08-01', pageSize: 10 };
    const statementImportsService = {
      listStatementImports: jest.fn().mockResolvedValue({
        items: [statementImport],
        nextCursor: 'next-page',
      }),
    };
    const controller = new StatementImportsController(
      statementImportsService as unknown as StatementImportsService,
    );

    await expect(
      controller.listStatementImports(authenticatedRequest(), query),
    ).resolves.toEqual({
      items: [
        {
          id: '100',
          fileName: 'august.pdf',
          statementDate: '2026-08-31',
          bank: 'Example Bank',
          cardType: 'visa',
          importedAt: '2026-08-29T00:00:00.000Z',
          transactionCount: '2',
        },
      ],
      nextCursor: 'next-page',
    });
    expect(statementImportsService.listStatementImports).toHaveBeenCalledWith(
      '7',
      query,
    );
  });
});

function statementImportRecord(
  overrides: Partial<StatementImportRecord> = {},
): StatementImportRecord {
  return {
    id: '100',
    userId: '7',
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}

function statementImportHistoryRecord(): StatementImportHistoryRecord {
  return {
    id: '100',
    userId: '7',
    fileName: 'august.pdf',
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: 'visa',
    importedAt: new Date('2026-08-29T00:00:00.000Z'),
    transactionCount: '2',
  };
}
