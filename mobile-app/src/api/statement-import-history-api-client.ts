import {
  authorizedRequest,
  type AuthorizedRequestOptions,
} from "./authorized-request.ts";
import { decodeApiResponse } from "./request-failure.ts";
import {
  record,
  text,
  id,
  count,
  amount,
  nullable,
  date,
  timestamp,
  readConfirmation,
  readEvidenceRow,
  type ImportConfirmation,
  type ImportEvidenceRow,
} from "./statement-import-detail-response.ts";

export type StatementImportHistoryItem = {
  id: string;
  fileName: string;
  statementDate: string | null;
  provider: string;
  accountFormat: string | null;
  statementType: "credit_card" | "e_wallet";
  historyFromDate: string | null;
  historyToDate: string | null;
  totalDebit: string | null;
  importedAt: string;
  importedByUserId: string;
  expenseCount: string;
  originalExpenseCount: string | null;
};
export type StatementImportHistoryPage = {
  items: StatementImportHistoryItem[];
  nextCursor: string | null;
};
export type StatementImportHistoryQuery = {
  fromDate?: string;
  toDate?: string;
  cursor?: string;
  pageSize?: number;
};
export type StatementImportDetail = Omit<
  StatementImportHistoryItem,
  "expenseCount" | "originalExpenseCount"
> & {
  confirmation: ImportConfirmation | null;
  rows: ImportEvidenceRow[];
  currentExpenses: { count: string; totalAmount: string };
};
export function createStatementImportHistoryApiClient(
  options: AuthorizedRequestOptions,
) {
  return {
    async list(
      spaceId: string,
      input: StatementImportHistoryQuery = {},
    ): Promise<StatementImportHistoryPage> {
      id(spaceId);
      const pageSize = input.pageSize ?? 100;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
        throw Error("Invalid page size");
      const query = new URLSearchParams({ pageSize: String(pageSize) });
      if (input.fromDate !== undefined)
        query.set("fromDate", date(input.fromDate));
      if (input.toDate !== undefined) query.set("toDate", date(input.toDate));
      if (input.fromDate && input.toDate && input.fromDate > input.toDate)
        throw Error("Invalid date range");
      if (input.cursor) query.set("cursor", input.cursor);
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${spaceId}/statement-imports?${query.toString()}`,
      );
      return decodeApiResponse(() => {
        const value = record(payload);
        if (
          !Array.isArray(value.items) ||
          !(
            value.nextCursor === null ||
            (typeof value.nextCursor === "string" &&
              /^[A-Za-z0-9_-]+$/u.test(value.nextCursor))
          )
        )
          throw Error("Invalid history page");
        return {
          items: value.items.map((value) => {
            const item = record(value);
            return {
              ...readMetadata(item),
              expenseCount: count(item.expenseCount),
              originalExpenseCount: nullable(item.originalExpenseCount, count),
            };
          }),
          nextCursor: value.nextCursor,
        };
      });
    },
    async detail(
      spaceId: string,
      statementImportId: string,
    ): Promise<StatementImportDetail> {
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${id(spaceId)}/statement-imports/${id(statementImportId)}`,
      );
      return decodeApiResponse(() => {
        const value = record(payload),
          current = record(value.currentExpenses);
        if (!Array.isArray(value.rows)) throw Error("Invalid evidence rows");
        const rows = value.rows.map(readEvidenceRow);
        if (new Set(rows.map((row) => row.sourceRowId)).size !== rows.length)
          throw Error("Duplicate evidence rows");
        return {
          ...readMetadata(value),
          confirmation: nullable(value.confirmation, readConfirmation),
          rows,
          currentExpenses: {
            count: count(current.count),
            totalAmount: amount(current.totalAmount),
          },
        };
      });
    },
  };
}
function readMetadata(
  value: Record<string, unknown>,
): Omit<StatementImportHistoryItem, "expenseCount" | "originalExpenseCount"> {
  if (!(
    value.statementType === "credit_card" || value.statementType === "e_wallet"
  ))
    throw Error("Invalid Statement type");
  return {
    id: id(value.id),
    fileName: text(value.fileName),
    provider: text(value.provider),
    statementType: value.statementType,
    statementDate: nullable(value.statementDate, date),
    accountFormat: nullable(value.accountFormat, text),
    historyFromDate: nullable(value.historyFromDate, date),
    historyToDate: nullable(value.historyToDate, date),
    totalDebit: nullable(value.totalDebit, amount),
    importedAt: timestamp(value.importedAt),
    importedByUserId: id(value.importedByUserId),
  };
}
