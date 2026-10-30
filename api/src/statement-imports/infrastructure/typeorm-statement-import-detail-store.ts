import {
  scopedTransaction,
  hasTransactionContext,
} from '../../database/transaction-context';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  safeEvidenceRow,
  type StatementImportDetailStore,
  type StatementImportExpenseLink,
} from '../application/statement-import-detail-store';
import { TypeOrmStatementImportStore } from './typeorm-statement-import-store';
import { TypeOrmImportRowStore } from './typeorm-import-confirmation-store';

@Injectable()
export class TypeOrmStatementImportDetailStore implements StatementImportDetailStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  read(spaceId: string, statementImportId: string) {
    const inherited = hasTransactionContext(this.dataSource);
    return scopedTransaction(
      this.dataSource,
      'REPEATABLE READ',
      async (manager) => {
        if (!inherited) await manager.query('SET TRANSACTION READ ONLY');
        const statementImport = await new TypeOrmStatementImportStore(
          manager,
        ).findByIdInSpace(spaceId, statementImportId);
        if (!statementImport) return null;
        const rows = await new TypeOrmImportRowStore(manager).findRows(
          spaceId,
          statementImportId,
        );
        const [currentExpenses] = await manager.query<
          { count: string; totalAmount: string }[]
        >(
          `
        SELECT COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS "totalAmount"
        FROM expenses WHERE space_id = $1 AND statement_import_id = $2 AND deleted_at IS NULL
      `,
          [spaceId, statementImportId],
        );
        const links = await manager.query<
          (StatementImportExpenseLink & { sourceRowId: string })[]
        >(
          `
        SELECT e.id::text, r.source_row_id AS "sourceRowId", e.deleted_at AS "deletedAt",
          EXISTS (SELECT 1 FROM expense_activities a WHERE a.space_id = e.space_id
            AND a.expense_id = e.id AND a.activity_type = 'edited') AS edited
        FROM statement_import_rows r JOIN expenses e
          ON e.space_id = r.space_id AND e.statement_import_id = r.statement_import_id
          AND e.source_row_id = r.source_row_id
          AND (e.statement_import_row_id = r.id OR e.statement_import_row_id IS NULL)
        WHERE r.space_id = $1 AND r.statement_import_id = $2 AND r.disposition = 'included'
      `,
          [spaceId, statementImportId],
        );
        const byRow = new Map(
          links.map(({ sourceRowId, ...link }) => [
            sourceRowId,
            {
              ...link,
              deletedAt:
                link.deletedAt == null
                  ? null
                  : new Date(link.deletedAt).toISOString(),
            },
          ]),
        );
        return {
          statementImport,
          currentExpenses: {
            count: currentExpenses.count,
            totalAmount: twoDecimals(currentExpenses.totalAmount),
          },
          rows: rows.map((row) => ({
            ...safeEvidenceRow(row),
            expense:
              row.disposition === 'included'
                ? (byRow.get(row.sourceRowId) ?? null)
                : null,
          })),
        };
      },
    );
  }
}

function twoDecimals(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
