import {
  ApiError,
  buildApiPath,
  parseApiCount,
  requireApiResponse,
  type ApiClient,
  type ApiDataErrorFactory,
} from "@/shared/api";
import {
  isCategoryCatalog,
  resolveCategoryColor,
  type CategoryCatalogItem,
  type CategoryColor,
} from "@/shared/category";
import type { CategoryRuleMatchType } from "@/shared/category-rule";
import { centsToMoney, moneyToCents } from "@/shared/money";

import type {
  CategorizedStatement,
  CategorizedTransaction,
} from "./statement-categorizer";
import {
  requireCategoryRule,
  requireCategoryRuleCollection,
  requireCategoryRules,
  requireStatementImport,
  requireStatementImportHistoryPage,
  type CategoryRuleResponse,
  type StatementImportHistoryItemResponse,
  type StatementImportResponse,
} from "./statement-import-api";
import {
  cleanDescription,
  isIncludedStatementTransaction,
  normalizeDescription,
} from "./statement-import-utils";
import type {
  StatementSummary,
  Transaction,
} from "./statement-parser/transformer";

type AssignmentProvenance = "rule" | "manual" | "ambiguous" | "unmapped";

interface CategoryRule {
  readonly id: string;
  readonly categoryId: string;
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
}

interface CategoryOption {
  readonly value: string;
  readonly label: string;
}

interface CategoryColorOption extends CategoryOption {
  readonly color: CategoryColor;
}

interface CategoryCatalogOption extends CategoryColorOption {
  readonly isActive: boolean;
}

interface CategorizationResult {
  readonly categoryId: string | null;
  readonly assignment: AssignmentProvenance;
  readonly matchedCategoryIds?: readonly string[];
}

interface RecentImport {
  readonly id: string;
  readonly fileName: string;
  readonly transactionCount: number;
  readonly statementDate: string;
  readonly provider: string;
  readonly accountType: string | null;
  readonly importedByUserId: string;
}

interface RememberCategoryRuleInput {
  readonly pattern: string;
  readonly categoryId: string;
  readonly matchType: CategoryRuleMatchType;
}

interface CategoryRuleConflict {
  readonly normalizedPattern: string;
  readonly requestedCategoryId: string;
  readonly existingCategoryId: string | null;
  readonly message: string;
}

type RememberCategoryRuleResult =
  | { readonly status: "created" | "existing"; readonly rule: CategoryRule }
  | { readonly status: "conflict"; readonly conflict: CategoryRuleConflict };

interface CommitStatementImportOptions {
  readonly acknowledgeProbableDuplicates?: boolean;
  readonly signal?: AbortSignal;
  readonly spaceId?: string;
}

interface CommittedStatementImport {
  readonly id: string;
  readonly fileName: string;
  readonly statementDate: string;
  readonly provider: string;
  readonly accountType: string | null;
  readonly importedAt: string;
  readonly transactionCount: number;
  readonly importedByUserId: string;
}

type StatementImportApiClient = Pick<ApiClient, "get" | "post">;

class StatementImportDataError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "StatementImportDataError";
  }
}

class StatementImportValidationError extends Error {
  readonly kind = "validation" as const;

  constructor(message: string) {
    super(message);
    this.name = "StatementImportValidationError";
  }
}

const createStatementImportDataError: ApiDataErrorFactory = (message) =>
  new StatementImportDataError(message);

function requireCategoryCatalog(
  response: unknown,
): readonly CategoryCatalogItem[] {
  if (!isCategoryCatalog(response)) {
    throw createStatementImportDataError(
      "The API returned an invalid Category catalog.",
    );
  }

  return response;
}

const statementDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const RECENT_IMPORT_PAGE_SIZE = 3;

function projectCategoryRule(rule: CategoryRuleResponse): CategoryRule {
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    pattern: rule.pattern,
    matchType: rule.matchType,
  };
}

async function getCategoryCatalogOptions(
  apiClient: StatementImportApiClient,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<readonly CategoryCatalogOption[]> {
  const response = requireCategoryCatalog(
    requireApiResponse(
      await apiClient.get<readonly CategoryCatalogItem[]>(
        spaceId === undefined
          ? "/categories"
          : `/spaces/${encodeURIComponent(spaceId)}/categories`,
        { signal },
      ),
      "Category catalog",
      createStatementImportDataError,
    ),
  );

  return response.map((category) => ({
    value: category.id,
    label: category.name,
    color: resolveCategoryColor(category.id, category.color),
    isActive: category.isActive,
  }));
}

async function getCategoryOptions(
  apiClient: StatementImportApiClient,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<readonly CategoryColorOption[]> {
  const categoryCatalog = await getCategoryCatalogOptions(
    apiClient,
    signal,
    spaceId,
  );

  return categoryCatalog
    .filter((category) => category.isActive)
    .map(({ value, label, color }) => ({ value, label, color }));
}

async function getCategoryRules(
  apiClient: StatementImportApiClient,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<readonly CategoryRule[]> {
  const response = requireApiResponse(
    await apiClient.get<unknown>(
      spaceId === undefined
        ? "/category-rules"
        : `/spaces/${encodeURIComponent(spaceId)}/category-rules`,
      { signal },
    ),
    "Category Rule list",
    createStatementImportDataError,
  );
  const rules = Array.isArray(response)
    ? requireCategoryRules(response, createStatementImportDataError)
    : requireCategoryRuleCollection(response, createStatementImportDataError)
        .rules;

  return rules.map(projectCategoryRule);
}

function projectRecentImport(
  item: StatementImportHistoryItemResponse,
): RecentImport {
  return {
    id: item.id,
    fileName: item.fileName,
    transactionCount: parseApiCount(
      item.transactionCount,
      `Statement Import ${item.id} transactionCount`,
      createStatementImportDataError,
    ),
    statementDate: statementDateFormatter
      .format(new Date(`${item.statementDate}T00:00:00Z`))
      .toLocaleUpperCase(),
    provider: item.bank,
    accountType: item.cardType,
    importedByUserId: item.importedByUserId,
  };
}

async function getRecentImports(
  apiClient: StatementImportApiClient,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<readonly RecentImport[]> {
  const collectionPath =
    spaceId === undefined
      ? "/statement-imports"
      : `/spaces/${encodeURIComponent(spaceId)}/statement-imports`;
  const path = buildApiPath(collectionPath, {
    pageSize: String(RECENT_IMPORT_PAGE_SIZE),
  });
  const response = requireStatementImportHistoryPage(
    requireApiResponse(
      await apiClient.get(path, { signal }),
      "Statement Import history page",
      createStatementImportDataError,
    ),
    createStatementImportDataError,
  );

  return response.items.map(projectRecentImport);
}

function categorizeTransactions(
  transactions: readonly Transaction[],
  rules: readonly CategoryRule[],
  activeCategoryIds?: ReadonlySet<string>,
): readonly CategorizationResult[] {
  const exactRules = rules.filter(
    (rule) =>
      rule.matchType === "exact" &&
      (!activeCategoryIds || activeCategoryIds.has(rule.categoryId)),
  );
  const containsRules = rules.filter(
    (rule) =>
      rule.matchType === "contains" &&
      (!activeCategoryIds || activeCategoryIds.has(rule.categoryId)),
  );

  function getMatchedCategoryIds(
    transaction: Transaction,
    matchingRules: readonly CategoryRule[],
    isMatch: (
      normalizedDescription: string,
      normalizedPattern: string,
    ) => boolean,
  ) {
    const normalizedDescription = normalizeDescription(transaction.description);
    const matchedCategoryIds = new Set<string>();

    matchingRules.forEach((rule) => {
      const normalizedPattern = normalizeDescription(rule.pattern);
      if (
        normalizedPattern &&
        isMatch(normalizedDescription, normalizedPattern)
      ) {
        matchedCategoryIds.add(rule.categoryId);
      }
    });

    return [...matchedCategoryIds];
  }

  return transactions.map((transaction) => {
    const exactCategoryIds = getMatchedCategoryIds(
      transaction,
      exactRules,
      (description, pattern) => description === pattern,
    );
    const matchedCategoryIds =
      exactCategoryIds.length > 0
        ? exactCategoryIds
        : getMatchedCategoryIds(
            transaction,
            containsRules,
            (description, pattern) => description.includes(pattern),
          );

    if (matchedCategoryIds.length === 1) {
      return {
        categoryId: matchedCategoryIds[0] ?? null,
        assignment: "rule" as const,
      };
    }

    if (matchedCategoryIds.length > 1) {
      return {
        categoryId: null,
        assignment: "ambiguous" as const,
        matchedCategoryIds,
      };
    }

    return { categoryId: null, assignment: "unmapped" as const };
  });
}

function createRuleConflict(
  normalizedPattern: string,
  requestedCategoryId: string,
  existingCategoryId: string | null,
  matchType: CategoryRuleMatchType,
): CategoryRuleConflict {
  const existingCategoryMessage = existingCategoryId
    ? `Category ${existingCategoryId}`
    : "another Category";
  const matchTypeLabel = matchType === "exact" ? "Exact" : "Contains";

  return {
    normalizedPattern,
    requestedCategoryId,
    existingCategoryId,
    message: `The ${matchTypeLabel} Category Rule for “${normalizedPattern}” already assigns ${existingCategoryMessage}. It was not changed.`,
  };
}

async function rememberCategoryRule(
  apiClient: StatementImportApiClient,
  input: RememberCategoryRuleInput,
  existingRules: readonly CategoryRule[],
  signal?: AbortSignal,
  spaceId?: string,
): Promise<RememberCategoryRuleResult> {
  const normalizedPattern = normalizeDescription(input.pattern);
  if (!normalizedPattern) {
    throw new StatementImportValidationError(
      "A Category Rule requires a non-empty pattern.",
    );
  }

  const existingRule = existingRules.find(
    (rule) =>
      rule.matchType === input.matchType &&
      normalizeDescription(rule.pattern) === normalizedPattern,
  );
  if (existingRule) {
    if (existingRule.categoryId === input.categoryId) {
      return { status: "existing", rule: projectCategoryRule(existingRule) };
    }

    return {
      status: "conflict",
      conflict: createRuleConflict(
        normalizedPattern,
        input.categoryId,
        existingRule.categoryId,
        input.matchType,
      ),
    };
  }

  try {
    const response = requireCategoryRule(
      requireApiResponse(
        await apiClient.post<CategoryRuleResponse>(
          spaceId === undefined
            ? "/category-rules"
            : `/spaces/${encodeURIComponent(spaceId)}/category-rules`,
          {
            pattern: normalizedPattern,
            categoryId: input.categoryId,
            matchType: input.matchType,
          },
          { signal },
        ),
        "created Category Rule",
        createStatementImportDataError,
      ),
      createStatementImportDataError,
    );

    if (response.categoryId !== input.categoryId) {
      throw createStatementImportDataError(
        "The API returned a Category Rule for another Category.",
      );
    }
    if (response.matchType !== input.matchType) {
      const requestedMatchTypeLabel =
        input.matchType === "exact" ? "Exact" : "Contains";
      const responseMatchTypeLabel =
        response.matchType === "exact" ? "Exact" : "Contains";
      throw createStatementImportDataError(
        `The API returned a ${responseMatchTypeLabel} Category Rule when a ${requestedMatchTypeLabel} Category Rule was requested.`,
      );
    }
    if (normalizeDescription(response.pattern) !== normalizedPattern) {
      throw createStatementImportDataError(
        "The API returned a Category Rule with a different pattern.",
      );
    }

    return { status: "created", rule: projectCategoryRule(response) };
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === "CATEGORY_RULE_PATTERN_ALREADY_EXISTS"
    ) {
      const currentRules = await getCategoryRules(apiClient, signal, spaceId);
      const conflictingRule = currentRules.find(
        (rule) =>
          rule.matchType === input.matchType &&
          normalizeDescription(rule.pattern) === normalizedPattern,
      );
      if (conflictingRule?.categoryId === input.categoryId) {
        return { status: "existing", rule: conflictingRule };
      }

      return {
        status: "conflict",
        conflict: createRuleConflict(
          normalizedPattern,
          input.categoryId,
          conflictingRule?.categoryId ?? null,
          input.matchType,
        ),
      };
    }

    throw error;
  }
}

function formatDateForApi(value: Date, description: string) {
  if (Number.isNaN(value.getTime())) {
    throw new StatementImportValidationError(`Choose a valid ${description}.`);
  }

  return value.toISOString().slice(0, 10);
}

function formatPositiveAmountForApi(value: number, description: string) {
  const absoluteValue = Math.abs(value);
  const scaledCents = absoluteValue * 100;
  const cents = moneyToCents(absoluteValue);
  const precisionTolerance = Number.EPSILON * Math.max(1, scaledCents) * 10;
  if (Math.abs(scaledCents - cents) > precisionTolerance) {
    throw new StatementImportValidationError(
      `${description} must have no more than two decimal places.`,
    );
  }

  if (!Number.isSafeInteger(cents) || cents === 0) {
    throw new StatementImportValidationError(
      `${description} must be a non-zero amount.`,
    );
  }

  return centsToMoney(cents).toFixed(2);
}

function getIncludedTransactions(
  transactions: readonly CategorizedTransaction[],
) {
  return transactions.filter(isIncludedStatementTransaction);
}

function buildCommitPayload(
  fileName: string,
  fileHash: string,
  statement: CategorizedStatement,
  acknowledgeProbableDuplicates = false,
) {
  if (!/^[0-9a-f]{64}$/.test(fileHash)) {
    throw new StatementImportValidationError(
      "The statement file hash must be a lowercase SHA-256 digest.",
    );
  }

  const includedTransactions = getIncludedTransactions(statement.transactions);
  const missingCategory = includedTransactions.find(
    (transaction) =>
      transaction.categoryId === null ||
      transaction.categoryId.trim().length === 0,
  );
  if (missingCategory) {
    throw new StatementImportValidationError(
      `Included Transaction ${missingCategory.id} must have a Category before import.`,
    );
  }

  const summary: StatementSummary = statement.summary;
  return {
    fileName: cleanDescription(fileName),
    fileHash,
    statementDate: formatDateForApi(summary.statementDate, "statement date"),
    bank: cleanDescription(summary.provider),
    cardType: cleanDescription(summary.accountType) || null,
    transactions: includedTransactions.map((transaction) => ({
      categoryId: transaction.categoryId,
      purchaseDate: formatDateForApi(
        transaction.transactionDate,
        "transaction date",
      ),
      description: cleanDescription(transaction.description),
      amount: formatPositiveAmountForApi(
        transaction.amount,
        `Transaction ${transaction.id}`,
      ),
    })),
    acknowledgeProbableDuplicates,
  };
}

async function hashStatementFile(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new StatementImportDataError(
      "This browser cannot calculate the statement file hash.",
    );
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function commitStatementImport(
  apiClient: StatementImportApiClient,
  file: File,
  statement: CategorizedStatement,
  options: CommitStatementImportOptions = {},
): Promise<CommittedStatementImport> {
  const fileHash = await hashStatementFile(file);
  const payload = buildCommitPayload(
    file.name,
    fileHash,
    statement,
    options.acknowledgeProbableDuplicates ?? false,
  );
  const response = requireStatementImport(
    requireApiResponse(
      await apiClient.post<StatementImportResponse>(
        options.spaceId === undefined
          ? "/statement-imports"
          : `/spaces/${encodeURIComponent(options.spaceId)}/statement-imports`,
        payload,
        { signal: options.signal },
      ),
      "committed Statement Import",
      createStatementImportDataError,
    ),
    createStatementImportDataError,
  );

  return {
    id: response.id,
    fileName: response.fileName,
    statementDate: response.statementDate,
    provider: response.bank,
    accountType: response.cardType,
    importedAt: response.importedAt,
    transactionCount: payload.transactions.length,
    importedByUserId: response.importedByUserId,
  };
}

export {
  StatementImportDataError,
  StatementImportValidationError,
  buildCommitPayload,
  categorizeTransactions,
  commitStatementImport,
  getCategoryCatalogOptions,
  getCategoryOptions,
  getCategoryRules,
  getIncludedTransactions,
  getRecentImports,
  hashStatementFile,
  rememberCategoryRule,
};
export type {
  AssignmentProvenance,
  CategoryCatalogOption,
  CategoryColorOption,
  CategoryOption,
  CategoryRule,
  CategoryRuleConflict,
  CategorizationResult,
  CommittedStatementImport,
  CommitStatementImportOptions,
  RecentImport,
  RememberCategoryRuleInput,
  RememberCategoryRuleResult,
  StatementImportApiClient,
};
