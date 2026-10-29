import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { SpaceMembershipEntity } from '../../database/entities/space-membership.entity';
import { StatementImportEntity } from '../../database/entities/statement-import.entity';
import { ExpenseEntity } from '../../database/entities/expense.entity';
import {
  prepareWritableSpace,
  lockWritableSpace,
} from '../../spaces/infrastructure/space-write-guard';
import { assertWritableSpace } from '../../spaces/application/assert-writable-space';
import { SpaceNotFoundError } from '../../spaces/application/space-errors';
import type {
  NewStatementImport,
  StatementImportHistoryRecord,
  StatementImportRecord,
  StatementImportStore,
  SpaceStatementImportHistoryPageQuery,
} from '../application/statement-import-store';

@Injectable()
export class TypeOrmStatementImportStore implements StatementImportStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async lockForStatementImport(spaceId: string, userId: string): Promise<void> {
    await prepareWritableSpace(this.entityManager, spaceId, userId);
    const space = await lockWritableSpace(this.entityManager, spaceId);
    const membership = await this.entityManager
      .getRepository(SpaceMembershipEntity)
      .createQueryBuilder('membership')
      .where('membership.spaceId = :spaceId', { spaceId })
      .andWhere('membership.userId = :userId', { userId })
      .setLock('pessimistic_read')
      .getOne();
    if (!membership) throw new SpaceNotFoundError();
    assertWritableSpace(space.status, membership.accessLevel);
  }

  async findByIdInSpace(
    spaceId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord | null> {
    const entity = await this.entityManager
      .getRepository(StatementImportEntity)
      .findOne({ where: { id: statementImportId, spaceId } });

    return entity ? toRecord(entity) : null;
  }

  async findPageInSpace(
    query: SpaceStatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]> {
    const statementImportQuery = this.entityManager
      .getRepository(StatementImportEntity)
      .createQueryBuilder('statementImport')
      .leftJoin(
        ExpenseEntity,
        'expense',
        'expense.statementImportId = statementImport.id AND expense.spaceId = statementImport.spaceId AND expense.deletedAt IS NULL',
      )
      .addSelect('COUNT(expense.id)', 'expenseCount')
      .where('statementImport.spaceId = :spaceId', {
        spaceId: query.spaceId,
      });

    if (query.filters.fromDate !== undefined) {
      statementImportQuery.andWhere(
        "(statementImport.importedAt AT TIME ZONE 'Asia/Manila')::date >= :fromDate",
        { fromDate: query.filters.fromDate },
      );
    }
    if (query.filters.toDate !== undefined) {
      statementImportQuery.andWhere(
        "(statementImport.importedAt AT TIME ZONE 'Asia/Manila')::date <= :toDate",
        {
          toDate: query.filters.toDate,
        },
      );
    }
    if (query.after) {
      statementImportQuery.andWhere(
        '(statementImport.importedAt < :cursorDate OR (statementImport.importedAt = :cursorDate AND statementImport.id < :cursorId))',
        {
          cursorDate: query.after.confirmedAt,
          cursorId: query.after.statementImportId,
        },
      );
    }

    const result = await statementImportQuery
      .groupBy('statementImport.id')
      .orderBy('statementImport.importedAt', 'DESC')
      .addOrderBy('statementImport.id', 'DESC')
      .take(query.pageSize + 1)
      .getRawAndEntities();

    const rawRows = result.raw as unknown as {
      expenseCount?: unknown;
    }[];
    return result.entities.map((entity, index) =>
      toHistoryRecord(entity, rawRows[index]?.expenseCount),
    );
  }

  async create(input: NewStatementImport): Promise<StatementImportRecord> {
    const entity = this.entityManager
      .getRepository(StatementImportEntity)
      .create({
        spaceId: input.spaceId,
        importedByUserId: input.importedByUserId,
        fileName: input.fileName,
        fileHash: input.fileHash,
        statementDate: input.statementDate,
        provider: input.provider,
        accountFormat: input.accountFormat,
        statementType: input.statementType,
        historyFromDate: input.historyFromDate,
        historyToDate: input.historyToDate,
        totalDebit: input.totalDebit,
        importedAt: input.importedAt,
        confirmationEvidence: input.confirmation?.evidence ?? null,
        includedCount: input.confirmation?.includedCount ?? null,
        excludedCount: input.confirmation?.excludedCount ?? null,
        originalExpenseCount: input.confirmation?.originalExpenseCount ?? null,
        originalExpenseTotal: input.confirmation?.originalExpenseTotal ?? null,
        acknowledgedWarnings: input.confirmation?.acknowledgedWarnings ?? null,
        acknowledgedWarningDigest:
          input.confirmation?.acknowledgedWarningDigest ?? null,
      });

    return toRecord(
      await this.entityManager
        .getRepository(StatementImportEntity)
        .save(entity),
    );
  }
}

function toRecord(entity: StatementImportEntity): StatementImportRecord {
  return {
    ...(entity.confirmationEvidence == null
      ? {}
      : {
          confirmation: {
            evidence: entity.confirmationEvidence,
            includedCount: entity.includedCount!,
            excludedCount: entity.excludedCount!,
            originalExpenseCount: entity.originalExpenseCount!,
            originalExpenseTotal: entity.originalExpenseTotal!,
            acknowledgedWarnings: entity.acknowledgedWarnings!,
            acknowledgedWarningDigest: entity.acknowledgedWarningDigest,
          },
        }),
    id: entity.id,
    spaceId: entity.spaceId,
    importedByUserId: entity.importedByUserId,
    fileName: entity.fileName,
    fileHash: entity.fileHash,
    statementDate: entity.statementDate,
    provider: entity.provider,
    accountFormat: entity.accountFormat,
    statementType: entity.statementType,
    historyFromDate: entity.historyFromDate,
    historyToDate: entity.historyToDate,
    totalDebit: entity.totalDebit,
    importedAt: entity.importedAt,
  };
}

function toHistoryRecord(
  entity: StatementImportEntity,
  expenseCount: unknown,
): StatementImportHistoryRecord {
  return {
    id: entity.id,
    spaceId: entity.spaceId,
    importedByUserId: entity.importedByUserId,
    fileName: entity.fileName,
    statementDate: entity.statementDate,
    provider: entity.provider,
    accountFormat: entity.accountFormat,
    statementType: entity.statementType,
    historyFromDate: entity.historyFromDate,
    historyToDate: entity.historyToDate,
    totalDebit: entity.totalDebit,
    importedAt: entity.importedAt,
    expenseCount: serializeExpenseCount(expenseCount),
  };
}

function serializeExpenseCount(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return '0';
}
