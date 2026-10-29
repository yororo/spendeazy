import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '../../errors/application-error';
import {
  GCASH_REFERENCE_HASHER,
  type GCashReferenceHasher,
} from './gcash-reference-hasher';
import {
  MANILA_CLOCK,
  systemManilaClock,
  type ManilaClock,
} from '../../http/manila-clock';
import { Optional } from '@nestjs/common';
import {
  REVIEWED_IMPORT_UNIT_OF_WORK,
  type ReviewedImportUnitOfWork,
  type ReviewedImportContext,
} from './reviewed-import-unit-of-work';
import {
  validateConfirmationPayload,
  validateConfirmationCategories,
} from './validate-confirmation-payload';
import {
  protectConfirmationReferences,
  confirmationRequestHash,
} from './confirmation-canonicalization';
import { buildImportWarnings } from './import-warnings';
import type {
  PrivateConfirmationPayload,
  CommittedImportResult,
} from './confirmation-payload';
import type {
  ImportOperationKey,
  ImportOperationRecord,
  SafeImportFailure,
} from './import-confirmation-store';
import {
  ImportConfirmationError,
  ImportReviewRequiredError,
} from './import-confirmation-errors';
import { computeImportFingerprint } from './import-fingerprint';
import { toExpenseActivitySnapshot } from '../../expenses/application/expense-activity-store';
@Injectable()
export class ReviewedImportService {
  constructor(
    @Inject(REVIEWED_IMPORT_UNIT_OF_WORK)
    private readonly unitOfWork: ReviewedImportUnitOfWork,
    @Inject(GCASH_REFERENCE_HASHER)
    private readonly hasher: GCashReferenceHasher,
    @Optional()
    @Inject(MANILA_CLOCK)
    private readonly clock: ManilaClock = systemManilaClock,
  ) {}
  async evidenceRows(
    userId: string,
    spaceId: string,
    statementImportId: string,
  ) {
    return this.unitOfWork.execute(async (context) => {
      await context.requireReadAccess(userId, spaceId);
      return (await context.rows.findRows(spaceId, statementImportId)).map(
        (row) => {
          const evidence = row.originalEvidence;
          return {
            sourceRowId: row.sourceRowId,
            disposition: row.disposition,
            originalEvidence: {
              sourceRowId: evidence.sourceRowId,
              pageIndex: evidence.pageIndex,
              sourceOrder: evidence.sourceOrder,
              original: evidence.original,
              normalized: evidence.normalized,
              classification: evidence.classification,
              classificationEvidence: evidence.classificationEvidence,
              matchingSource: evidence.matchingSource,
            },
            confirmedValues: row.confirmedValues,
            exclusion: row.exclusion,
          };
        },
      );
    });
  }
  async preview(userId: string, spaceId: string, input: unknown) {
    const payload = validateConfirmationPayload(input, this.clock());
    return this.unitOfWork.execute(async (context) => {
      await context.requireReadAccess(userId, spaceId);
      await validateConfirmationCategories(payload, (id) =>
        context.categories.findBySpaceId(spaceId, id),
      );
      return buildImportWarnings(
        context,
        spaceId,
        protectConfirmationReferences(payload, spaceId, this.hasher),
      );
    });
  }
  async confirm(
    userId: string,
    spaceId: string,
    operationId: string,
    input: unknown,
  ): Promise<{ result: CommittedImportResult; replayed: boolean }> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        operationId,
      )
    )
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Invalid operation identifier.',
      );
    // Structural validation is safe on replay; current Category/date eligibility is not.
    const key = {
      actorUserId: userId,
      spaceId,
      operationId: operationId.toLowerCase(),
    };
    const payload = validateConfirmationPayload(input, this.clock());
    const protectedPayload = protectConfirmationReferences(
      payload,
      spaceId,
      this.hasher,
    );
    const requestHash = confirmationRequestHash(spaceId, protectedPayload);
    const existing = await this.unitOfWork.execute(async (context) => {
      await context.requireReadAccess(userId, spaceId);
      return context.operations.find(key, false);
    });
    if (existing) {
      const replay = terminal(existing, requestHash);
      if (replay) return { result: replay, replayed: true };
    } else {
      await this.unitOfWork.execute(async (context) => {
        await context.lockExecutionScope(userId, spaceId);
        await context.requireReadAccess(userId, spaceId);
        const concurrent = await context.operations.find(key, false);
        if (concurrent) {
          assertHash(concurrent, requestHash);
          return;
        }
        await context.spaces!.lockForStatementImport(spaceId, userId);
        const admitted = await context.operations.admit(key, requestHash);
        assertHash(admitted, requestHash);
      });
    }
    const outcome = await this.unitOfWork.execute(async (context) => {
      await context.lockExecutionScope(userId, spaceId);
      await context.requireReadAccess(userId, spaceId);
      const operation = await context.operations.find(key, true);
      if (!operation) throw new Error('Admitted import operation missing');
      const replay = terminal(operation, requestHash);
      if (replay) return { result: replay, replayed: true };
      try {
        return await context.savepoint(async () => {
          await context.spaces!.lockForStatementImport(spaceId, userId);
          await validateConfirmationCategories(payload, (id) =>
            context.categories.findBySpaceId(spaceId, id),
          );
          const preview = await buildImportWarnings(
            context,
            spaceId,
            protectedPayload,
          );
          const ids = preview.warnings.map((warning) => warning.id).sort();
          const acknowledged = [
            ...protectedPayload.acknowledgedWarnings,
          ].sort();
          if (
            JSON.stringify(ids) !== JSON.stringify(acknowledged) ||
            (ids.length
              ? protectedPayload.acknowledgedWarningDigest !==
                preview.warningDigest
              : protectedPayload.acknowledgedWarningDigest !== null)
          )
            throw new ImportReviewRequiredError(preview);
          // Validate every key before financial inserts; all Rule writes share the savepoint.
          await context.appendRules(spaceId, protectedPayload.rememberedRules);
          const result = await writeImport(
            context,
            key,
            protectedPayload,
            preview.warnings,
            this.clock(),
          );
          await context.operations.commit(key, result);
          return { result, replayed: false };
        });
      } catch (error) {
        if (!(error instanceof ApplicationError)) throw error;
        const failure: SafeImportFailure =
          error instanceof ImportConfirmationError
            ? error.failure
            : {
                code: error.code,
                details: error.details.map(({ field, code }) => ({
                  field,
                  code,
                })),
              };
        // Still holding the operation lock after savepoint rollback; terminal metadata commits alone.
        await context.operations.reject(key, failure);
        return { failure };
      }
    });
    if (outcome.failure) throwFailure(outcome.failure);
    return outcome;
  }
}
function assertHash(operation: ImportOperationRecord, hash: string) {
  if (operation.requestHash !== hash)
    throw new ImportConfirmationError({
      code: 'IMPORT_OPERATION_PAYLOAD_CONFLICT',
      details: [],
    });
}
function terminal(operation: ImportOperationRecord, hash: string) {
  assertHash(operation, hash);
  if (operation.status === 'committed') {
    if (!operation.successResult)
      throw new Error('Committed operation missing result');
    return operation.successResult;
  }
  if (operation.status === 'not_committed') {
    if (!operation.failure)
      throw new Error('Rejected operation missing failure');
    throwFailure(operation.failure);
  }
  return null;
}
function throwFailure(failure: SafeImportFailure): never {
  if (failure.review) throw new ImportReviewRequiredError(failure.review);
  throw new ImportConfirmationError(failure);
}
async function writeImport(
  context: ReviewedImportContext,
  key: ImportOperationKey,
  payload: PrivateConfirmationPayload,
  warnings: import('./confirmation-payload').ImportAdvisoryWarning[],
  now: Date,
) {
  const total = payload.expenses.reduce(
    (sum, row) => sum + BigInt(row.amount.replace('.', '')),
    0n,
  );
  const originalExpenseTotal = `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`;
  const evidence = {
    parserVersion: payload.evidence.parserVersion,
    extractionEngineVersion: payload.evidence.extractionEngineVersion,
    controlTotals: payload.evidence.controlTotals,
    reconciliation: payload.evidence.reconciliation,
    pages: payload.evidence.pages,
    completeness: payload.evidence.completeness,
  };
  const saved = await context.statementImports.create({
    ...payload.statement,
    importedByUserId: key.actorUserId,
    spaceId: key.spaceId,
    importedAt: now,
    totalDebit: null,
    confirmation: {
      evidence,
      includedCount: String(payload.expenses.length),
      excludedCount: String(payload.excluded.length),
      originalExpenseCount: String(payload.expenses.length),
      originalExpenseTotal,
      acknowledgedWarnings: warnings,
      acknowledgedWarningDigest: payload.acknowledgedWarningDigest,
    },
  });
  const snapshots = await context.rows.createRows(
    key.spaceId,
    saved.id,
    payload,
  );
  for (const expense of payload.expenses) {
    const row = snapshots.find(
      (row) => row.sourceRowId === expense.sourceRowId,
    )!;
    const created = await context.importedExpenses.create({
      ...expense,
      description: expense.description.trim(),
      spaceId: key.spaceId,
      addedByUserId: key.actorUserId,
      statementImportId: saved.id,
      statementImportRowId: row.id,
      importFingerprint: computeImportFingerprint(payload.statement, expense),
      referenceHash: row.originalEvidence.referenceHash,
    });
    await context.expenseActivities.create({
      expenseId: created.id,
      spaceId: key.spaceId,
      actorUserId: key.actorUserId,
      type: 'created',
      occurredAt: created.createdAt,
      after: toExpenseActivitySnapshot(created),
    });
  }
  return {
    status: 'committed' as const,
    operationId: key.operationId,
    statementImportId: saved.id,
    confirmedAt: saved.importedAt.toISOString(),
    originalExpenseCount: String(payload.expenses.length),
    originalExpenseTotal,
  };
}
