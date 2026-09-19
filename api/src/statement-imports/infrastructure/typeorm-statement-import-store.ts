import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager } from 'typeorm';
import { POSTGRES_UNIQUE_VIOLATION } from '../../database/database-error-codes';
import { StatementImportEntity } from '../../database/entities/statement-import.entity';
import { TransactionEntity } from '../../database/entities/transaction.entity';
import { StatementImportFileAlreadyExistsError } from '../application/statement-import-errors';
import type {
  NewStatementImport,
  StatementImportHistoryPageQuery,
  StatementImportHistoryRecord,
  StatementImportRecord,
  StatementImportStore,
} from '../application/statement-import-store';

const STATEMENT_IMPORT_FILE_HASH_UNIQUE_CONSTRAINT =
  'ux_statement_imports_user_file_hash';

@Injectable()
export class TypeOrmStatementImportStore implements StatementImportStore {
  constructor(
    @InjectEntityManager()
    public readonly entityManager: EntityManager,
  ) {}

  async findById(
    userId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord | null> {
    const entity = await this.entityManager
      .getRepository(StatementImportEntity)
      .findOne({ where: { id: statementImportId, userId } });

    return entity ? toRecord(entity) : null;
  }

  async findByFileHash(
    userId: string,
    fileHash: string,
  ): Promise<StatementImportRecord | null> {
    const entity = await this.entityManager
      .getRepository(StatementImportEntity)
      .findOne({
        where: { userId, fileHash },
      });

    return entity ? toRecord(entity) : null;
  }

  async findPage(
    query: StatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]> {
    const statementImportQuery = this.entityManager
      .getRepository(StatementImportEntity)
      .createQueryBuilder('statementImport')
      .leftJoin(
        TransactionEntity,
        'transaction',
        'transaction.statementImportId = statementImport.id AND transaction.userId = statementImport.userId',
      )
      .addSelect('COUNT(transaction.id)', 'transactionCount')
      .where('statementImport.userId = :userId', { userId: query.userId });

    if (query.filters.fromDate !== undefined) {
      statementImportQuery.andWhere(
        'statementImport.statementDate >= :fromDate',
        { fromDate: query.filters.fromDate },
      );
    }
    if (query.filters.toDate !== undefined) {
      statementImportQuery.andWhere(
        'statementImport.statementDate <= :toDate',
        {
          toDate: query.filters.toDate,
        },
      );
    }
    if (query.after) {
      statementImportQuery.andWhere(
        '(statementImport.statementDate < :cursorDate OR (statementImport.statementDate = :cursorDate AND statementImport.id < :cursorId))',
        {
          cursorDate: query.after.statementDate,
          cursorId: query.after.statementImportId,
        },
      );
    }

    const result = await statementImportQuery
      .groupBy('statementImport.id')
      .orderBy('statementImport.statementDate', 'DESC')
      .addOrderBy('statementImport.id', 'DESC')
      .take(query.pageSize + 1)
      .getRawAndEntities();

    const rawRows = result.raw as unknown as {
      transactionCount?: unknown;
    }[];
    return result.entities.map((entity, index) =>
      toHistoryRecord(entity, rawRows[index]?.transactionCount),
    );
  }

  async create(input: NewStatementImport): Promise<StatementImportRecord> {
    const entity = this.entityManager
      .getRepository(StatementImportEntity)
      .create({
        userId: input.userId,
        fileName: input.fileName,
        fileHash: input.fileHash,
        statementDate: input.statementDate,
        bank: input.bank,
        cardType: input.cardType,
        importedAt: input.importedAt,
      });

    try {
      return toRecord(
        await this.entityManager
          .getRepository(StatementImportEntity)
          .save(entity),
      );
    } catch (error: unknown) {
      if (isFileHashUniqueViolation(error)) {
        throw new StatementImportFileAlreadyExistsError();
      }

      throw error;
    }
  }
}

function toRecord(entity: StatementImportEntity): StatementImportRecord {
  return {
    id: entity.id,
    userId: entity.userId,
    fileName: entity.fileName,
    fileHash: entity.fileHash,
    statementDate: entity.statementDate,
    bank: entity.bank,
    cardType: entity.cardType,
    importedAt: entity.importedAt,
  };
}

function toHistoryRecord(
  entity: StatementImportEntity,
  transactionCount: unknown,
): StatementImportHistoryRecord {
  return {
    id: entity.id,
    userId: entity.userId,
    fileName: entity.fileName,
    statementDate: entity.statementDate,
    bank: entity.bank,
    cardType: entity.cardType,
    importedAt: entity.importedAt,
    transactionCount: serializeTransactionCount(transactionCount),
  };
}

function serializeTransactionCount(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return '0';
}

function isFileHashUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as {
    code?: unknown;
    constraint?: unknown;
  };
  return (
    driverError.code === POSTGRES_UNIQUE_VIOLATION &&
    driverError.constraint === STATEMENT_IMPORT_FILE_HASH_UNIQUE_CONSTRAINT
  );
}
