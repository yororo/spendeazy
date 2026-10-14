import { isRecord, type ApiDataErrorFactory } from "./api-response";

interface ExpenseHistoryItem {
  readonly id: string;
  readonly categoryId: string | null;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
  readonly source: "manual" | "imported";
  readonly statementImportId: string | null;
  readonly updatedAt?: string;
  readonly addedByUserId?: string;
  readonly deletedAt?: string;
}

interface ExpenseResponse {
  readonly id: string;
  readonly categoryId: string | null;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
  readonly source: "manual" | "imported";
  readonly updatedAt: string;
  readonly addedByUserId?: string;
}

interface ExpenseHistoryPage {
  readonly items: readonly ExpenseHistoryItem[];
  readonly nextCursor: string | null;
  readonly totalCount?: string;
}

function isExpenseHistoryItem(
  value: unknown,
): value is ExpenseHistoryItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.categoryId === null || typeof value.categoryId === "string") &&
    typeof value.purchaseDate === "string" &&
    typeof value.description === "string" &&
    typeof value.amount === "string" &&
    (value.source === "manual" || value.source === "imported") &&
    (value.statementImportId === null ||
      typeof value.statementImportId === "string") &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string") &&
    (value.addedByUserId === undefined ||
      typeof value.addedByUserId === "string") &&
    (value.deletedAt === undefined || typeof value.deletedAt === "string")
  );
}

function isExpenseResponse(value: unknown): value is ExpenseResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.categoryId === null || typeof value.categoryId === "string") &&
    typeof value.purchaseDate === "string" &&
    typeof value.description === "string" &&
    typeof value.amount === "string" &&
    (value.source === "manual" || value.source === "imported") &&
    typeof value.updatedAt === "string" &&
    (value.addedByUserId === undefined ||
      typeof value.addedByUserId === "string")
  );
}

function requireExpenseHistoryPage(
  response: unknown,
  createError: ApiDataErrorFactory,
): ExpenseHistoryPage {
  if (
    !isRecord(response) ||
    !Array.isArray(response.items) ||
    !response.items.every(isExpenseHistoryItem) ||
    !("nextCursor" in response) ||
    (response.nextCursor !== null && typeof response.nextCursor !== "string") ||
    (response.totalCount !== undefined &&
      (typeof response.totalCount !== "string" || !/^\d+$/.test(response.totalCount)))
  ) {
    throw createError("The API returned an invalid Expense history page.");
  }

  return response as unknown as ExpenseHistoryPage;
}

function requireExpenseResponse(
  response: unknown,
  description: string,
  createError: ApiDataErrorFactory,
): ExpenseResponse {
  if (!isExpenseResponse(response)) {
    throw createError(`The API returned an invalid ${description}.`);
  }

  return response;
}

export { requireExpenseHistoryPage, requireExpenseResponse };
export type {
  ExpenseHistoryItem,
  ExpenseHistoryPage,
  ExpenseResponse,
};
