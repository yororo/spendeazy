import {
  isRecord,
  isUtcDateTime,
  type ApiDataErrorFactory,
} from "@/shared/api";
import type { StatementType } from "./statement-type";
import {
  isCategoryRuleMatchType,
  type CategoryRuleMatchType,
} from "@/shared/category-rule";

interface CategoryRuleResponse {
  readonly id: string;
  readonly categoryId: string;
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
}

interface CategoryRuleCollectionResponse {
  readonly rules: readonly CategoryRuleResponse[];
  readonly revision: string;
}

interface StatementImportResponse {
  readonly id: string;
  readonly fileName: string;
  readonly statementDate: string;
  readonly bank: string;
  readonly cardType: string | null;
  readonly statementType: StatementType;
  readonly transactionHistoryStartDate: string | null;
  readonly totalDebit: string | null;
  readonly importedAt: string;
  readonly importedByUserId: string;
}

interface StatementImportHistoryItemResponse extends StatementImportResponse {
  readonly transactionCount: string;
}

interface StatementImportHistoryPageResponse {
  readonly items: readonly StatementImportHistoryItemResponse[];
  readonly nextCursor: string | null;
}

const POSITIVE_INTEGER_ID_PATTERN = /^[1-9]\d*$/u;
const CATEGORY_RULE_ID_PATTERN = POSITIVE_INTEGER_ID_PATTERN;
const CATEGORY_RULE_PATTERN_LIMIT = 500;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MONEY_PATTERN = /^\d{1,13}\.\d{2}$/u;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return month >= 1 && month <= 12 && day >= 1 && day <= (daysInMonth[month - 1] ?? 0);
}

function isCategoryRuleResponse(value: unknown): value is CategoryRuleResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    CATEGORY_RULE_ID_PATTERN.test(value.id) &&
    typeof value.categoryId === "string" &&
    CATEGORY_RULE_ID_PATTERN.test(value.categoryId) &&
    typeof value.pattern === "string" &&
    value.pattern.length >= 1 &&
    value.pattern.length <= CATEGORY_RULE_PATTERN_LIMIT &&
    value.pattern.trim().length > 0 &&
    isCategoryRuleMatchType(value.matchType)
  );
}

function requireCategoryRule(
  response: unknown,
  createError: ApiDataErrorFactory,
): CategoryRuleResponse {
  if (!isCategoryRuleResponse(response)) {
    throw createError("The API returned an invalid Category Rule.");
  }

  return response;
}

function requireCategoryRules(
  response: unknown,
  createError: ApiDataErrorFactory,
): readonly CategoryRuleResponse[] {
  if (!Array.isArray(response) || !response.every(isCategoryRuleResponse)) {
    throw createError("The API returned an invalid Category Rule list.");
  }

  return response;
}

function requireCategoryRuleCollection(
  response: unknown,
  createError: ApiDataErrorFactory,
): CategoryRuleCollectionResponse {
  if (
    !isRecord(response) ||
    !Array.isArray(response.rules) ||
    !response.rules.every(isCategoryRuleResponse) ||
    typeof response.revision !== "string" ||
    !/^\d+$/u.test(response.revision)
  ) {
    throw createError("The API returned an invalid Category Rule collection.");
  }

  return response as unknown as CategoryRuleCollectionResponse;
}

function isStatementImportResponse(
  value: unknown,
): value is StatementImportResponse {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.fileName !== "string" ||
    !isCalendarDate(value.statementDate) ||
    typeof value.bank !== "string" ||
    (value.cardType !== null && typeof value.cardType !== "string") ||
    (value.statementType !== "credit_card" &&
      value.statementType !== "e_wallet") ||
    !isUtcDateTime(value.importedAt) ||
    typeof value.importedByUserId !== "string" ||
    !POSITIVE_INTEGER_ID_PATTERN.test(value.importedByUserId)
  ) {
    return false;
  }

  return hasValidStatementImportControls(value);
}

function hasValidStatementImportControls(
  value: Record<string, unknown>,
): boolean {
  if (value.statementType === "credit_card") {
    return (
      value.transactionHistoryStartDate === null && value.totalDebit === null
    );
  }

  return (
    typeof value.transactionHistoryStartDate === "string" &&
    isCalendarDate(value.transactionHistoryStartDate) &&
    typeof value.statementDate === "string" &&
    isCalendarDate(value.statementDate) &&
    value.transactionHistoryStartDate <= value.statementDate &&
    typeof value.totalDebit === "string" &&
    MONEY_PATTERN.test(value.totalDebit)
  );
}

function isStatementImportHistoryItemResponse(
  value: unknown,
): value is StatementImportHistoryItemResponse {
  return (
    isStatementImportResponse(value) &&
    typeof (value as unknown as Record<string, unknown>).transactionCount ===
      "string" &&
    /^\d+$/u.test(
      (value as unknown as Record<string, unknown>).transactionCount as string,
    )
  );
}

function requireStatementImport(
  response: unknown,
  createError: ApiDataErrorFactory,
): StatementImportResponse {
  if (!isStatementImportResponse(response)) {
    throw createError("The API returned an invalid Statement Import.");
  }

  return response;
}

function requireStatementImportHistoryPage(
  response: unknown,
  createError: ApiDataErrorFactory,
): StatementImportHistoryPageResponse {
  if (
    !isRecord(response) ||
    !Array.isArray(response.items) ||
    !response.items.every(isStatementImportHistoryItemResponse) ||
    !("nextCursor" in response) ||
    (response.nextCursor !== null && typeof response.nextCursor !== "string")
  ) {
    throw createError(
      "The API returned an invalid Statement Import history page.",
    );
  }

  return response as unknown as StatementImportHistoryPageResponse;
}

export {
  requireCategoryRule,
  requireCategoryRuleCollection,
  requireCategoryRules,
  requireStatementImport,
  requireStatementImportHistoryPage,
};
export type {
  CategoryRuleCollectionResponse,
  CategoryRuleResponse,
  StatementImportHistoryItemResponse,
  StatementImportHistoryPageResponse,
  StatementImportResponse,
};
