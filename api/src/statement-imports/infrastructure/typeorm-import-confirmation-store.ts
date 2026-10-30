import type { EntityManager } from 'typeorm';
import { StatementImportOperationEntity } from '../../database/entities/statement-import-operation.entity';
import { StatementImportRowEntity } from '../../database/entities/statement-import-row.entity';
import type {
  CommittedImportResult,
  PrivateConfirmationPayload,
} from '../application/confirmation-payload';
import type {
  ImportOperationKey,
  ImportOperationRecord,
  ImportOperationStore,
  ImportRowSnapshot,
  ImportRowStore,
  SafeImportFailure,
} from '../application/import-confirmation-store';

export class TypeOrmImportOperationStore implements ImportOperationStore {
  constructor(private readonly manager: EntityManager) {}

  async admit(
    key: ImportOperationKey,
    requestHash: string,
  ): Promise<ImportOperationRecord> {
    await this.manager
      .getRepository(StatementImportOperationEntity)
      .createQueryBuilder()
      .insert()
      .values({ ...key, requestHash })
      .orIgnore()
      .execute();
    const record = await this.find(key, false);
    if (!record) throw new Error('Import operation admission failed');
    return record;
  }

  async find(
    key: ImportOperationKey,
    lock: boolean | 'nowait',
  ): Promise<ImportOperationRecord | null> {
    const query = this.manager
      .getRepository(StatementImportOperationEntity)
      .createQueryBuilder('operation')
      .where(
        'operation.actorUserId = :actorUserId AND operation.spaceId = :spaceId AND operation.operationId = :operationId',
        key,
      );
    if (lock) query.setLock('pessimistic_write');
    if (lock === 'nowait') query.setOnLocked('nowait');
    return query.getOne();
  }

  async commit(
    key: ImportOperationKey,
    result: CommittedImportResult,
  ): Promise<void> {
    await this.transition(key, {
      status: 'committed',
      statementImportId: result.statementImportId,
      successResult: {
        status: 'committed',
        operationId: result.operationId,
        statementImportId: result.statementImportId,
        confirmedAt: result.confirmedAt,
        originalExpenseCount: result.originalExpenseCount,
        originalExpenseTotal: result.originalExpenseTotal,
      },
    });
  }

  async reject(
    key: ImportOperationKey,
    failure: SafeImportFailure,
  ): Promise<void> {
    // Explicit projection prevents accidental runtime spreading of financial payloads.
    const safe = {
      code: safeCode(failure.code),
      ...(failure.review
        ? {
            review: {
              warningDigest: safeHash(failure.review.warningDigest),
              warnings: failure.review.warnings.map((warning) => ({
                id: safeHash(warning.id),
                type: warning.type,
                sourceRowIds: warning.sourceRowIds.map(safeRowId),
                expenseIds: warning.expenseIds.map(safeId),
                statementImportIds: warning.statementImportIds.map(safeId),
                message: safeWarningMessage(warning.type),
              })),
            },
          }
        : {}),
      details: failure.details.map((detail) => ({
        field: safePath(detail.field),
        code: safeCode(detail.code),
      })),
    };
    await this.transition(key, { status: 'not_committed', failure: safe });
  }

  private async transition(
    key: ImportOperationKey,
    values: Partial<StatementImportOperationEntity>,
  ): Promise<void> {
    const result = await this.manager
      .getRepository(StatementImportOperationEntity)
      .update({ ...key, status: 'pending' }, values);
    if (result.affected !== 1)
      throw new Error('Import operation is not pending');
  }
}

export class TypeOrmImportRowStore implements ImportRowStore {
  constructor(private readonly manager: EntityManager) {}

  async createRows(
    spaceId: string,
    statementImportId: string,
    payload: PrivateConfirmationPayload,
  ): Promise<ImportRowSnapshot[]> {
    const expenses = new Map(
      payload.expenses.map((row) => [row.sourceRowId, row]),
    );
    const excluded = new Map(
      payload.excluded.map((row) => [row.sourceRowId, row]),
    );
    const repository = this.manager.getRepository(StatementImportRowEntity);
    return repository.save(
      payload.evidence.transactions.map((originalEvidence) => {
        if (
          'duplicateReference' in originalEvidence ||
          !Object.hasOwn(originalEvidence, 'referenceHash') ||
          (originalEvidence.referenceHash !== null &&
            !/^[0-9a-f]{64}$/u.test(originalEvidence.referenceHash))
        ) {
          throw new Error('Import evidence must have protected references');
        }
        const confirmedValues =
          expenses.get(originalEvidence.sourceRowId) ?? null;
        return repository.create({
          spaceId,
          statementImportId,
          sourceRowId: originalEvidence.sourceRowId,
          disposition: confirmedValues ? 'included' : 'excluded',
          originalEvidence,
          confirmedValues,
          exclusion: excluded.get(originalEvidence.sourceRowId) ?? null,
        });
      }),
    );
  }

  findRows(
    spaceId: string,
    statementImportId: string,
  ): Promise<ImportRowSnapshot[]> {
    return this.manager
      .getRepository(StatementImportRowEntity)
      .find({ where: { spaceId, statementImportId }, order: { id: 'ASC' } });
  }
}

function safeCode(value: string): string {
  if (!/^[A-Za-z_]{1,100}$/u.test(value))
    throw new Error('Invalid safe import error code');
  return value;
}
function safePath(value: string): string {
  if (
    !/^\/(?:[A-Za-z]+|\d+)(?:\/(?:[A-Za-z]+|\d+))*$/u.test(value) ||
    value.length > 200
  )
    throw new Error('Invalid safe import error path');
  return value;
}
function safeHash(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error('Invalid warning hash');
  return value;
}
function safeId(value: string): string {
  if (!/^[1-9][0-9]*$/u.test(value))
    throw new Error('Invalid warning identifier');
  return value;
}
function safeRowId(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    [...value].length > 100
  )
    throw new Error('Invalid warning row identifier');
  return value;
}
function safeWarningMessage(type: string): string {
  switch (type) {
    case 'reconciliation':
      return 'Original statement reconciliation or extraction needs review.';
    case 'exact_file':
      return 'This file was previously imported into this Space.';
    case 'probable_duplicate':
      return 'Reviewed spending resembles another imported Expense or reviewed row.';
    default:
      throw new Error('Invalid warning type');
  }
}
