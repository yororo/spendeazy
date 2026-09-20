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

interface CategoryRuleCollectionResponse {
  readonly rules: readonly CategoryRuleResponse[];
  readonly revision: string;
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

interface CategoryRuleSnapshot {
  readonly rules: readonly CategoryRule[];
  readonly revision?: string;
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

function isCategoryRuleCollectionResponse(
  value: unknown,
): value is CategoryRuleCollectionResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.rules) &&
    value.rules.every(isCategoryRuleResponse) &&
    typeof value.revision === "string" &&
    /^\d+$/u.test(value.revision)
  );
}

function buildCategoryRulesPath(spaceId?: string) {
  return spaceId === undefined
    ? "/category-rules"
    : `/spaces/${encodeURIComponent(spaceId)}/category-rules`;
}

function buildCategoryRuleReplacementPath(
  categoryId: string,
  spaceId?: string,
) {
  const categoryPath = `/categories/${encodeURIComponent(categoryId)}/rules`;
  return spaceId === undefined
    ? categoryPath
    : `/spaces/${encodeURIComponent(spaceId)}${categoryPath}`;
}

async function getCategoryRuleSnapshot(
  apiClient: CategoryRulesApiClient,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<CategoryRuleSnapshot> {
  const payload = requireApiResponse(
    await apiClient.get<unknown>(buildCategoryRulesPath(spaceId), {
      signal,
      expectedStatuses: [200],
    }),
    "Category Rule list",
    createCategoryRulesError,
  );
  if (isCategoryRuleCollectionResponse(payload)) {
    return {
      rules: payload.rules.map(projectCategoryRule),
      revision: payload.revision,
    };
  }

  return {
    rules: requireCategoryRuleResponses(payload, createCategoryRulesError).map(
      projectCategoryRule,
    ),
  };
}

async function getCategoryRules(
  apiClient: CategoryRulesApiClient,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<readonly CategoryRule[]> {
  return (await getCategoryRuleSnapshot(apiClient, signal, spaceId)).rules;
}

async function replaceCategoryRuleSnapshot(
  apiClient: CategoryRulesApiClient,
  categoryId: string,
  rules: readonly CategoryRuleInput[],
  spaceId?: string,
  revision?: string,
): Promise<CategoryRuleSnapshot> {
  const response = await apiClient.put<unknown>(
    buildCategoryRuleReplacementPath(categoryId, spaceId),
    {
      ...(revision === undefined ? {} : { revision }),
      rules: rules.map(({ pattern, matchType }) => ({ pattern, matchType })),
    },
    { expectedStatuses: [200] },
  );
  const payload = requireApiResponse(
    response,
    "replaced Category Rule list",
    createCategoryRulesError,
  );
  if (isCategoryRuleCollectionResponse(payload)) {
    return {
      rules: payload.rules.map(projectCategoryRule),
      revision: payload.revision,
    };
  }

  const persistedRules = requireCategoryRuleResponses(
    payload,
    createCategoryRulesError,
  );
  if (persistedRules.some((rule) => rule.categoryId !== categoryId)) {
    throw createCategoryRulesError(
      "The API returned a Category Rule for another Category.",
    );
  }

  return { rules: persistedRules.map(projectCategoryRule) };
}

async function replaceCategoryRules(
  apiClient: CategoryRulesApiClient,
  categoryId: string,
  rules: readonly CategoryRuleInput[],
  spaceId?: string,
  revision?: string,
): Promise<readonly CategoryRule[]> {
  return (
    await replaceCategoryRuleSnapshot(
      apiClient,
      categoryId,
      rules,
      spaceId,
      revision,
    )
  ).rules;
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
  buildCategoryRuleReplacementPath,
  buildCategoryRulesPath,
  CategoryRulesDataError,
  getCategoryRuleSnapshot,
  getCategoryRules,
  isCategoryRuleCollectionResponse,
  replaceCategoryRuleSnapshot,
  replaceCategoryRules,
  requireCategoryRuleResponses,
};
export type {
  CategoryRule,
  CategoryRuleCollectionResponse,
  CategoryRuleInput,
  CategoryRuleSnapshot,
  CategoryRulesApiClient,
};
