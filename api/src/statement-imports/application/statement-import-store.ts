export const STATEMENT_IMPORT_STORE = Symbol('STATEMENT_IMPORT_STORE');

export interface StatementImportHistoryFilters {
  fromDate?: string;
  toDate?: string;
}

export interface StatementImportHistoryCursorPosition {
  statementDate: string;
  statementImportId: string;
}

export interface StatementImportHistoryPageQuery {
  userId: string;
  filters: StatementImportHistoryFilters;
  after: StatementImportHistoryCursorPosition | null;
  pageSize: number;
}

export interface StatementImportRecord {
  id: string;
  userId: string;
  fileName: string;
  fileHash: string;
  statementDate: string;
  bank: string;
  cardType: string | null;
  importedAt: Date;
}

export interface StatementImportHistoryRecord extends Omit<
  StatementImportRecord,
  'fileHash'
> {
  transactionCount: string;
}

export interface NewStatementImport {
  userId: string;
  fileName: string;
  fileHash: string;
  statementDate: string;
  bank: string;
  cardType: string | null;
  importedAt: Date;
}

export interface StatementImportStore {
  findById(
    userId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord | null>;
  findByFileHash(
    userId: string,
    fileHash: string,
  ): Promise<StatementImportRecord | null>;
  findPage(
    query: StatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]>;
  create(input: NewStatementImport): Promise<StatementImportRecord>;
}
