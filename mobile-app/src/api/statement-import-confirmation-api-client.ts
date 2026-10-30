import { authorizedRequest, type AuthorizedRequestOptions } from './authorized-request.ts';
import { decodeApiResponse, ExpenseApiError } from './request-failure.ts';
import type { ConfirmationPayload } from '../features/statement-import/confirmation-contract.ts';

export type ImportWarning = { id: string; type: 'reconciliation' | 'exact_file' | 'probable_duplicate'; sourceRowIds: string[]; expenseIds: string[]; statementImportIds: string[]; message: string };
export type ImportPreview = { warnings: ImportWarning[]; warningDigest: string };
export type CommittedImport = { status: 'committed'; operationId: string; statementImportId: string; confirmedAt: string; originalExpenseCount: string; originalExpenseTotal: string };
export type ImportOperationStatus = CommittedImport | { status: 'pending'; operationId: string } | { status: 'not_committed'; operationId: string; failure: { code: string; details: { field: string; code: string }[]; review?: ImportPreview } };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
  return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw Error();
  return value;
}
export function decodeImportPreview(value: unknown): ImportPreview {
  return decodeApiResponse(() => {
    const data = record(value);
    if (typeof data.warningDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(data.warningDigest) || !Array.isArray(data.warnings)) throw Error();
    const warnings = data.warnings.map(value => {
      const w = record(value);
      if (typeof w.id !== 'string' || !w.id || typeof w.message !== 'string' || !['reconciliation', 'exact_file', 'probable_duplicate'].includes(String(w.type))) throw Error();
      return { id: w.id, type: w.type as ImportWarning['type'], message: w.message, sourceRowIds: strings(w.sourceRowIds), expenseIds: strings(w.expenseIds), statementImportIds: strings(w.statementImportIds) };
    });
    if (new Set(warnings.map(w => w.id)).size !== warnings.length) throw Error();
    return { warnings, warningDigest: data.warningDigest };
  });
}
export function decodeCommittedImport(value: unknown, operationId: string): CommittedImport {
  return decodeApiResponse(() => {
    const data = record(value);
    if (data.status !== 'committed' || data.operationId !== operationId || typeof data.statementImportId !== 'string' || !/^[1-9]\d*$/u.test(data.statementImportId) || typeof data.confirmedAt !== 'string' || !Number.isFinite(Date.parse(data.confirmedAt)) || typeof data.originalExpenseCount !== 'string' || !/^[1-9]\d*$/u.test(data.originalExpenseCount) || typeof data.originalExpenseTotal !== 'string' || !/^(?:0|[1-9]\d*)\.\d{2}$/u.test(data.originalExpenseTotal)) throw Error();
    return { status: 'committed', operationId, statementImportId: data.statementImportId, confirmedAt: data.confirmedAt, originalExpenseCount: data.originalExpenseCount, originalExpenseTotal: data.originalExpenseTotal };
  });
}
export interface ImportConfirmationApi {
  status(spaceId: string, operationId: string): Promise<ImportOperationStatus>;
  preview(spaceId: string, payload: ConfirmationPayload): Promise<ImportPreview>;
  confirm(spaceId: string, operationId: string, frozenJson: string): Promise<CommittedImport>;
}
export function createStatementImportConfirmationApiClient(options: AuthorizedRequestOptions): ImportConfirmationApi {
  const path = (spaceId: string) => `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}`;
  return {
    async status(spaceId, operationId) {
      return decodeImportOperationStatus(await authorizedRequest<unknown>(options, `${path(spaceId)}/statement-import-operations/${encodeURIComponent(operationId)}`, { method: 'GET' }), operationId);
    },
    async preview(spaceId, payload) {
      return decodeImportPreview(await authorizedRequest<unknown>(options, `${path(spaceId)}/statement-import-previews`, { method: 'POST', body: payload }));
    },
    async confirm(spaceId, operationId, frozenJson) {
      try {
        return decodeCommittedImport(await authorizedRequest<unknown>(options, `${path(spaceId)}/statement-import-operations/${encodeURIComponent(operationId)}`, { method: 'PUT', serializedBody: frozenJson }), operationId);
      } catch (error) {
        if (error instanceof ExpenseApiError && error.code === 'IMPORT_REVIEW_REQUIRED') {
          throw new ExpenseApiError(error.status, error.code, error.message, error.details, decodeImportPreview(error.review));
        }
        throw error;
      }
    },
  };
}

export function decodeImportOperationStatus(value: unknown, operationId: string): ImportOperationStatus {
  return decodeApiResponse(() => {
    const data = record(value);
    if (data.operationId !== operationId) throw Error();
    if (data.status === 'committed') return decodeCommittedImport(data, operationId);
    if (data.status === 'pending') {
      exactKeys(data, ['status', 'operationId']);
      return { status: 'pending', operationId };
    }
    if (data.status !== 'not_committed') throw Error();
    exactKeys(data, ['status', 'operationId', 'failure']);
    const failure = record(data.failure);
    exactKeys(failure, ['code', 'details'], ['review']);
    if (!safeCode(failure.code) || !Array.isArray(failure.details)) throw Error();
    const details = failure.details.map(value => {
      const detail = record(value);
      exactKeys(detail, ['field', 'code']);
      if (typeof detail.field !== 'string' || detail.field.length > 200 || !/^\/(?:[A-Za-z]+|\d+)(?:\/(?:[A-Za-z]+|\d+))*$/u.test(detail.field) || !safeCode(detail.code)) throw Error();
      return { field: detail.field, code: detail.code };
    });
    return { status: 'not_committed', operationId, failure: { code: failure.code, details, ...(Object.hasOwn(failure, 'review') ? { review: decodeImportPreview(failure.review) } : {}) } };
  });
}
function safeCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_]{1,100}$/u.test(value);
}
function exactKeys(data: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(data, key)) || Object.keys(data).some(key => !required.includes(key) && !optional.includes(key))) throw Error();
}
