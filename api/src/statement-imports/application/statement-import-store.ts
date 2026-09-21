export const STATEMENT_IMPORT_STORE = Symbol('STATEMENT_IMPORT_STORE');

export interface StatementImportHistoryFilters {
  fromDate?: string;
  toDate?: string;
}

export interface StatementImportHistoryCursorPosition {
  statementDate: string;
  statementImportId: string;
}

export interface SpaceStatementImportHistoryPageQuery {
  spaceId: string;
  filters: StatementImportHistoryFilters;
  after: StatementImportHistoryCursorPosition | null;
  pageSize: number;
}

export interface StatementImportRecord {
  id: string;
  spaceId: string;
  importedByUserId: string;
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
  spaceId: string;
  importedByUserId: string;
  fileName: string;
  fileHash: string;
  statementDate: string;
  bank: string;
  cardType: string | null;
  importedAt: Date;
}

export interface SpaceStatementImportStore {
  findByIdInSpace(
    spaceId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord | null>;
  findByFileHashInSpace(
    spaceId: string,
    fileHash: string,
  ): Promise<StatementImportRecord | null>;
  findPageInSpace(
    query: SpaceStatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]>;
}

export interface StatementImportStore extends SpaceStatementImportStore {
  create(input: NewStatementImport): Promise<StatementImportRecord>;
}
