import { ReviewedImportService } from './reviewed-import.service';
import type {
  ReviewedImportContext,
  ReviewedImportUnitOfWork,
} from './reviewed-import-unit-of-work';
import type { ImportOperationRecord } from './import-confirmation-store';
import { NodeGCashReferenceHasher } from '../infrastructure/node-gcash-reference-hasher';
import { ApplicationError } from '../../errors/application-error';

const operationId = '11111111-1111-4111-8111-111111111111';
const result = {
  status: 'committed' as const,
  operationId,
  statementImportId: '9',
  confirmedAt: '2026-10-30T00:00:00Z',
  originalExpenseCount: '2',
  originalExpenseTotal: '1300.00',
};
describe('Import operation recovery', () => {
  let record: ImportOperationRecord | null;
  const access = jest.fn();
  const lock = jest.fn();
  const reject = jest.fn();
  const find = jest.fn();
  const context = {
    requireReadAccess: access,
    lockExecutionScope: lock,
    operations: { find, reject },
  } as unknown as ReviewedImportContext;
  const work: ReviewedImportUnitOfWork = {
    execute: (fn) => fn(context),
    recover: (fn) => fn(context),
  };
  const recover = jest.spyOn(work, 'recover');
  const service = new ReviewedImportService(
    work,
    new NodeGCashReferenceHasher('fictional-key'),
  );
  beforeEach(() => {
    jest.resetAllMocks();
    record = {
      actorUserId: '1',
      spaceId: '2',
      operationId,
      requestHash: 'a'.repeat(64),
      status: 'pending',
      statementImportId: null,
      successResult: null,
      failure: null,
      createdAt: new Date(0),
    };
    find.mockImplementation(() => record);
    recover.mockImplementation((fn) => fn(context));
  });
  it('fences only known pending records under ordered nonblocking locks', async () => {
    expect(await service.status('1', '2', operationId)).toEqual({
      status: 'not_committed',
      operationId,
      failure: { code: 'IMPORT_OPERATION_NOT_COMMITTED', details: [] },
    });
    expect(access).toHaveBeenCalledTimes(2);
    expect(lock).toHaveBeenCalledWith('1', '2', true);
    expect(find).toHaveBeenLastCalledWith(
      { actorUserId: '1', spaceId: '2', operationId },
      'nowait',
    );
    expect(reject).toHaveBeenCalledTimes(1);
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      access.mock.invocationCallOrder[1],
    );
    expect(access.mock.invocationCallOrder[1]).toBeLessThan(
      find.mock.invocationCallOrder[1],
    );
  });
  it('returns pending for lock contention regardless of old admission time', async () => {
    recover.mockResolvedValue(null);
    expect(await service.status('1', '2', operationId)).toEqual({
      status: 'pending',
      operationId,
    });
    expect(reject).not.toHaveBeenCalled();
  });
  it.each(['committed', 'not_committed'] as const)(
    'reads immutable %s metadata without execution locks',
    async (status) => {
      record!.status = status;
      record!.successResult = result;
      record!.failure = {
        code: 'IMPORT_REVIEW_REQUIRED',
        details: [{ field: '/expenses/0', code: 'invalid_value' }],
        review: { warnings: [], warningDigest: 'b'.repeat(64) },
      };
      expect(await service.status('1', '2', operationId)).toEqual(
        status === 'committed'
          ? result
          : { status, operationId, failure: record!.failure },
      );
      expect(recover).not.toHaveBeenCalled();
    },
  );
  it('rechecks terminal state after acquiring locks', async () => {
    record!.status = 'committed';
    record!.successResult = result;
    find
      .mockResolvedValueOnce({ ...record, status: 'pending' })
      .mockResolvedValueOnce(record);
    expect(await service.status('1', '2', operationId)).toEqual(result);
    expect(reject).not.toHaveBeenCalled();
  });
  it('does not create unknown operations or disclose inaccessible records', async () => {
    record = null;
    await expect(service.status('1', '2', operationId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    expect(recover).not.toHaveBeenCalled();
    access.mockRejectedValueOnce(
      new ApplicationError('SPACE_NOT_FOUND', 'Missing'),
    );
    find.mockClear();
    await expect(service.status('1', '2', operationId)).rejects.toMatchObject({
      code: 'SPACE_NOT_FOUND',
    });
    expect(find).not.toHaveBeenCalled();
  });
  it('propagates unexpected recovery failures and rechecks authorization', async () => {
    recover.mockRejectedValueOnce(new Error('fictional disconnect'));
    await expect(service.status('1', '2', operationId)).rejects.toThrow(
      'fictional disconnect',
    );
    access
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new ApplicationError('SPACE_NOT_FOUND', 'Missing'),
      );
    await expect(service.status('1', '2', operationId)).rejects.toMatchObject({
      code: 'SPACE_NOT_FOUND',
    });
    expect(reject).not.toHaveBeenCalled();
  });
  it('validates identifiers before persistence', async () => {
    await expect(service.status('1', '2', 'invalid')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(find).not.toHaveBeenCalled();
  });
});
