import { isRecord, type ApiDataErrorFactory } from "./api-response";

interface TransactionHistoryItem {
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

interface TransactionResponse {
  readonly id: string;
  readonly categoryId: string | null;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
  readonly source: "manual" | "imported";
  readonly updatedAt: string;
  readonly addedByUserId?: string;
}

interface TransactionHistoryPage {
  readonly items: readonly TransactionHistoryItem[];
  readonly nextCursor: string | null;
}

function isTransactionHistoryItem(
  value: unknown,
): value is TransactionHistoryItem {
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

function isTransactionResponse(value: unknown): value is TransactionResponse {
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

function requireTransactionHistoryPage(
  response: unknown,
  createError: ApiDataErrorFactory,
): TransactionHistoryPage {
  if (
    !isRecord(response) ||
    !Array.isArray(response.items) ||
    !response.items.every(isTransactionHistoryItem) ||
    !("nextCursor" in response) ||
    (response.nextCursor !== null && typeof response.nextCursor !== "string")
  ) {
    throw createError("The API returned an invalid Transaction history page.");
  }

  return response as unknown as TransactionHistoryPage;
}

function requireTransactionResponse(
  response: unknown,
  description: string,
  createError: ApiDataErrorFactory,
): TransactionResponse {
  if (!isTransactionResponse(response)) {
    throw createError(`The API returned an invalid ${description}.`);
  }

  return response;
}

export { requireTransactionHistoryPage, requireTransactionResponse };
export type {
  TransactionHistoryItem,
  TransactionHistoryPage,
  TransactionResponse,
};
