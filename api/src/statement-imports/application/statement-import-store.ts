import type { StatementType } from './statement-type';
import type {
  ImportAdvisoryWarning,
  PrivateConfirmationPayload,
} from './confirmation-payload';

export interface ImmutableImportConfirmation {
  evidence: Omit<PrivateConfirmationPayload['evidence'], 'transactions'>;
  includedCount: string;
  excludedCount: string;
  originalExpenseCount: string;
  originalExpenseTotal: string;
  acknowledgedWarnings: ImportAdvisoryWarning[];
  acknowledgedWarningDigest: string | null;
}

export const STATEMENT_IMPORT_STORE = Symbol('STATEMENT_IMPORT_STORE');

export interface StatementImportHistoryFilters {
  fromDate?: string;
  toDate?: string;
}

export interface StatementImportHistoryCursorPosition {
  confirmedAt: string;
  statementImportId: string;
}

export interface SpaceStatementImportHistoryPageQuery {
  spaceId: string;
  filters: StatementImportHistoryFilters;
  after: StatementImportHistoryCursorPosition | null;
  pageSize: number;
}

export interface StatementImportRecord {
  confirmation?: ImmutableImportConfirmation;
  id: string;
  spaceId: string;
  importedByUserId: string;
  fileName: string;
  fileHash: string;
  statementDate: string | null;
  provider: string;
  accountFormat: string | null;
  statementType: StatementType;
  historyFromDate: string | null;
  historyToDate: string | null;
  totalDebit: string | null;
  importedAt: Date;
}

export interface StatementImportHistoryRecord extends Omit<
  StatementImportRecord,
  'fileHash'
> {
  expenseCount: string;
}

export interface NewStatementImport {
  confirmation?: ImmutableImportConfirmation;
  spaceId: string;
  importedByUserId: string;
  fileName: string;
  fileHash: string;
  statementDate: string | null;
  provider: string;
  accountFormat: string | null;
  statementType: StatementType;
  historyFromDate: string | null;
  historyToDate: string | null;
  totalDebit: string | null;
  importedAt: Date;
}

export interface SpaceStatementImportStore {
  findByIdInSpace(
    spaceId: string,
    statementImportId: string,
  ): Promise<StatementImportRecord | null>;
  findPageInSpace(
    query: SpaceStatementImportHistoryPageQuery,
  ): Promise<StatementImportHistoryRecord[]>;
}

export interface StatementImportStore extends SpaceStatementImportStore {
  create(input: NewStatementImport): Promise<StatementImportRecord>;
}
