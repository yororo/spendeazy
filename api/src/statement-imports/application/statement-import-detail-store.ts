import type { StatementImportRecord } from './statement-import-store';
import type { ImportRowSnapshot } from './import-confirmation-store';

export const STATEMENT_IMPORT_DETAIL_STORE = Symbol(
  'STATEMENT_IMPORT_DETAIL_STORE',
);
export function safeEvidenceRow(row: ImportRowSnapshot) {
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
}
export interface StatementImportExpenseLink {
  id: string;
  edited: boolean;
  deletedAt: string | null;
}
export interface StatementImportDetail {
  statementImport: StatementImportRecord;
  currentExpenses: { count: string; totalAmount: string };
  rows: (ReturnType<typeof safeEvidenceRow> & {
    expense: StatementImportExpenseLink | null;
  })[];
}
export interface StatementImportDetailStore {
  read(
    spaceId: string,
    statementImportId: string,
  ): Promise<StatementImportDetail | null>;
}
