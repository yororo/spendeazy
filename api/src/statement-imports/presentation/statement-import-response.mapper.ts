import { API_PREFIX } from '../../config/app-config';
import type {
  StatementImportHistoryRecord,
  StatementImportRecord,
} from '../application/statement-import-store';
import {
  StatementImportHistoryResponseDto,
  StatementImportResponseDto,
} from './statement-import-response.dto';

export type StatementImportResponse = StatementImportResponseDto;
export type StatementImportHistoryResponse = StatementImportHistoryResponseDto;

export function toStatementImportResponse(
  statementImport: StatementImportResponseInput,
): StatementImportResponseDto {
  return {
    id: statementImport.id,
    fileName: statementImport.fileName,
    statementDate: statementImport.statementDate,
    provider: statementImport.provider,
    accountFormat: statementImport.accountFormat,
    statementType: statementImport.statementType,
    historyFromDate: statementImport.historyFromDate,
    historyToDate: statementImport.historyToDate,
    totalDebit: statementImport.totalDebit,
    importedAt: statementImport.importedAt.toISOString(),
    importedByUserId: statementImport.importedByUserId,
  };
}

type StatementImportResponseInput = Pick<
  StatementImportRecord,
  | 'id'
  | 'fileName'
  | 'statementDate'
  | 'provider'
  | 'accountFormat'
  | 'statementType'
  | 'historyFromDate'
  | 'historyToDate'
  | 'totalDebit'
  | 'importedAt'
  | 'importedByUserId'
>;

export function toStatementImportHistoryResponse(
  statementImport: StatementImportHistoryRecord,
): StatementImportHistoryResponseDto {
  return {
    ...toStatementImportResponse(statementImport),
    expenseCount: statementImport.expenseCount,
  };
}

export function spaceStatementImportLocation(
  spaceId: string,
  statementImportId: string,
): string {
  return `/${API_PREFIX}/users/me/spaces/${spaceId}/statement-imports/${statementImportId}`;
}
