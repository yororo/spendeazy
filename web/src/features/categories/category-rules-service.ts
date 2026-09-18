import {
  isRecord,
  requireApiResponse,
  type ApiClient,
  type ApiDataErrorFactory,
} from "@/shared/api";
import {
  isCategoryRuleMatchType,
  type CategoryRuleMatchType,
} from "@/shared/category-rule";

interface CategoryRuleResponse {
  readonly id: string;
  readonly categoryId: string;
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CategoryRule {
  readonly id: string;
  readonly categoryId: string;
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CategoryRuleInput {
  readonly pattern: string;
  readonly matchType: CategoryRuleMatchType;
}

type CategoryRulesApiClient = Pick<ApiClient, "get" | "put">;

const CATEGORY_RULE_ID_PATTERN = /^[1-9]\d*$/u;
const CATEGORY_RULE_PATTERN_LIMIT = 500;

class CategoryRulesDataError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CategoryRulesDataError";
  }
}

const createCategoryRulesError: ApiDataErrorFactory = (message) =>
  new CategoryRulesDataError(message);

function isCategoryRuleResponse(
  value: unknown,
): value is CategoryRuleResponse {
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
    isCategoryRuleMatchType(value.matchType) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function requireCategoryRuleResponses(
  response: unknown,
  createError: ApiDataErrorFactory,
): readonly CategoryRuleResponse[] {
  if (!Array.isArray(response) || !response.every(isCategoryRuleResponse)) {
    throw createError("The API returned an invalid Category Rule list.");
  }

  return response;
}

function buildCategoryRulesPath(categoryId: string) {
  return `/categories/${encodeURIComponent(categoryId)}/rules`;
}

async function getCategoryRules(
  apiClient: CategoryRulesApiClient,
  signal?: AbortSignal,
): Promise<readonly CategoryRule[]> {
  const response = await apiClient.get<unknown>("/category-rules", {
    signal,
    expectedStatuses: [200],
  });

  return requireCategoryRuleResponses(
    requireApiResponse(
      response,
      "Category Rule list",
      createCategoryRulesError,
    ),
    createCategoryRulesError,
  ).map(projectCategoryRule);
}

async function replaceCategoryRules(
  apiClient: CategoryRulesApiClient,
  categoryId: string,
  rules: readonly CategoryRuleInput[],
): Promise<readonly CategoryRule[]> {
  const response = await apiClient.put<unknown>(
    buildCategoryRulesPath(categoryId),
    { rules: rules.map(({ pattern, matchType }) => ({ pattern, matchType })) },
    { expectedStatuses: [200] },
  );
  const persistedRules = requireCategoryRuleResponses(
    requireApiResponse(
      response,
      "replaced Category Rule list",
      createCategoryRulesError,
    ),
    createCategoryRulesError,
  );

  if (persistedRules.some((rule) => rule.categoryId !== categoryId)) {
    throw createCategoryRulesError(
      "The API returned a Category Rule for another Category.",
    );
  }

  return persistedRules.map(projectCategoryRule);
}

function projectCategoryRule(response: CategoryRuleResponse): CategoryRule {
  return {
    id: response.id,
    categoryId: response.categoryId,
    pattern: response.pattern,
    matchType: response.matchType,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}

export {
  buildCategoryRulesPath,
  CategoryRulesDataError,
  getCategoryRules,
  replaceCategoryRules,
  requireCategoryRuleResponses,
};
export type {
  CategoryRule,
  CategoryRuleInput,
  CategoryRulesApiClient,
};
