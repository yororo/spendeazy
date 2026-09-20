import { isRecord, type ApiDataErrorFactory } from "@/shared/api";
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
  readonly importedAt: string;
}

interface StatementImportHistoryItemResponse extends StatementImportResponse {
  readonly transactionCount: string;
}

interface StatementImportHistoryPageResponse {
  readonly items: readonly StatementImportHistoryItemResponse[];
  readonly nextCursor: string | null;
}

const CATEGORY_RULE_ID_PATTERN = /^[1-9]\d*$/u;
const CATEGORY_RULE_PATTERN_LIMIT = 500;

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
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fileName === "string" &&
    typeof value.statementDate === "string" &&
    typeof value.bank === "string" &&
    (value.cardType === null || typeof value.cardType === "string") &&
    typeof value.importedAt === "string"
  );
}

function isStatementImportHistoryItemResponse(
  value: unknown,
): value is StatementImportHistoryItemResponse {
  return (
    isStatementImportResponse(value) &&
    typeof (value as unknown as Record<string, unknown>).transactionCount ===
      "string"
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
