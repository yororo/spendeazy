import { isRecord, type ApiDataErrorFactory } from "./api-response";

interface TransactionHistoryItem {
  readonly id: string;
  readonly categoryId: string | null;
  readonly purchaseDate: string;
  readonly description: string;
  readonly amount: string;
  readonly source: "manual" | "imported";
  readonly statementImportId: string | null;
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
      typeof value.statementImportId === "string")
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

export { requireTransactionHistoryPage };
export type { TransactionHistoryItem, TransactionHistoryPage };
