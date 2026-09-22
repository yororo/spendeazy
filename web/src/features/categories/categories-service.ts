import {
  buildMonthlyCategorySummaryPath,
  parseApiMoney,
  ApiError,
  requireApiResponse,
  requireMonthlyCategorySummary,
  type ApiClient,
  type CategorySummaryItem,
  type CategorySummaryResponse,
} from "@/shared/api";
import { centsToMoney, moneyToCents } from "@/shared/money";
import {
  isCategoryCatalog,
  isCategoryCatalogItem,
  resolveCategoryColor,
  type CategoryCatalogItem,
  type CategoryColor,
} from "@/shared/category";
import {
  formatReportingPeriod,
  type ReportingPeriod,
} from "@/shared/reporting-period";

import { requireBudgetResponse } from "./budget-api";

interface CategoryOverviewItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly color: CategoryColor;
  readonly isActive: boolean;
  readonly budget: number | null;
  readonly spent: number;
  readonly remaining: number | null;
  readonly usage: number | null;
  readonly updatedAt: string | null;
}

interface CategoriesOverview {
  readonly period: ReportingPeriod;
  readonly periodLabel: string;
  readonly categories: readonly CategoryOverviewItem[];
  readonly totalBudget: number;
  readonly totalSpent: number;
  readonly totalRemaining: number;
}

interface CreateCategoryInput {
  readonly name: string;
  readonly description: string | null;
  readonly color?: CategoryColor;
  readonly spaceId?: string;
}

interface SaveCategoryBudgetInput {
  readonly categoryId: string;
  readonly amount: string;
  readonly spaceId?: string;
  readonly updatedAt?: string;
}

interface UpdateCategoryInput {
  readonly categoryId: string;
  readonly name: string;
  readonly description: string | null;
  readonly color?: CategoryColor;
  readonly spaceId?: string;
  readonly updatedAt: string | null;
}

interface UpdateCategoryStatusInput {
  readonly categoryId: string;
  readonly isActive: boolean;
  readonly spaceId?: string;
  readonly updatedAt: string | null;
}

interface CategoryBudget {
  readonly amount: string;
  readonly period: "monthly" | "yearly";
  readonly createdAt?: string;
  readonly updatedAt: string;
}

type CategoriesApiClient = Pick<
  ApiClient,
  "get" | "post" | "put" | "patch" | "delete"
>;

class CategoriesDataError extends Error {
  readonly kind = "data" as const;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CategoriesDataError";
  }
}

const createCategoriesError = (message: string) =>
  new CategoriesDataError(message);

function requireCategoryCatalog(
  response: unknown,
): readonly CategoryCatalogItem[] {
  if (!isCategoryCatalog(response)) {
    throw createCategoriesError("The API returned an invalid Category catalog.");
  }

  return response;
}

function requireCategoryResponse(response: unknown): CategoryCatalogItem {
  if (!isCategoryCatalogItem(response)) {
    throw createCategoriesError("The API returned an invalid Category.");
  }

  return response;
}

function parseCategoryMoney(
  value: string | null,
  field: string,
): number | null {
  if (value === null) return null;

  return centsToMoney(
    moneyToCents(parseApiMoney(value, field, createCategoriesError)),
  );
}

function calculateUsage(spent: number, budget: number | null) {
  if (budget === null) return null;
  if (budget === 0) return 0;

  return Math.round((moneyToCents(spent) / moneyToCents(budget)) * 100);
}

function projectCategory(
  category: CategoryCatalogItem | undefined,
  summary: CategorySummaryItem,
): CategoryOverviewItem {
  const spent = parseCategoryMoney(
    summary.totalAmount,
    `Category ${summary.categoryId} totalAmount`,
  );
  const budget = parseCategoryMoney(
    summary.budgetAmount,
    `Category ${summary.categoryId} budgetAmount`,
  );

  return {
    id: category?.id ?? summary.categoryId,
    name: category?.name ?? summary.name,
    description: category?.description?.trim() || null,
    color: resolveCategoryColor(
      category?.id ?? summary.categoryId,
      category?.color,
    ),
    isActive: category?.isActive ?? summary.isActive,
    budget,
    spent: spent ?? 0,
    remaining: parseCategoryMoney(
      summary.remainingAmount,
      `Category ${summary.categoryId} remainingAmount`,
    ),
    usage: calculateUsage(spent ?? 0, budget),
    updatedAt: category?.updatedAt ?? null,
  };
}

function projectCatalogOnlyCategory(
  category: CategoryCatalogItem,
): CategoryOverviewItem {
  return {
    id: category.id,
    name: category.name,
    description: category.description?.trim() || null,
    color: resolveCategoryColor(category.id, category.color),
    isActive: category.isActive,
    budget: null,
    spent: 0,
    remaining: null,
    usage: null,
    updatedAt: category.updatedAt,
  };
}

function sumCategoryMoney(
  categories: readonly CategoryOverviewItem[],
  property: "budget" | "spent" | "remaining",
) {
  return centsToMoney(
    categories.reduce(
      (total, category) =>
        total +
        (category[property] === null
          ? 0
          : moneyToCents(category[property])),
      0,
    ),
  );
}

async function getCategoriesOverview(
  apiClient: CategoriesApiClient,
  period: ReportingPeriod,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<CategoriesOverview> {
  const summaryPath = buildMonthlyCategorySummaryPath(period, spaceId);
  const [categoriesResponse, summaryResponse] = await Promise.all([
    apiClient.get<readonly CategoryCatalogItem[]>(
      buildCategoryCollectionPath(spaceId),
      { signal },
    ),
    apiClient.get<CategorySummaryResponse>(summaryPath, { signal }),
  ]);
  const categoryCatalog = requireCategoryCatalog(
    requireApiResponse(categoriesResponse, "Category catalog", createCategoriesError),
  );
  const categorySummary = requireMonthlyCategorySummary(
    requireApiResponse(
      summaryResponse,
      "monthly Category Summary",
      createCategoriesError,
    ),
    createCategoriesError,
  );
  const summaryById = new Map(
    categorySummary.categories.map((category) => [
      category.categoryId,
      category,
    ]),
  );
  const projectedIds = new Set<string>();
  const categories: CategoryOverviewItem[] = categoryCatalog.map((category) => {
    const summary = summaryById.get(category.id);
    if (!summary) return projectCatalogOnlyCategory(category);

    projectedIds.add(category.id);
    return projectCategory(category, summary);
  });

  categorySummary.categories.forEach((summary) => {
    if (projectedIds.has(summary.categoryId)) return;

    categories.push(projectCategory(undefined, summary));
  });

  return {
    period,
    periodLabel: formatReportingPeriod(period),
    categories,
    totalBudget: sumCategoryMoney(categories, "budget"),
    totalSpent: sumCategoryMoney(categories, "spent"),
    totalRemaining: sumCategoryMoney(categories, "remaining"),
  };
}

function normalizeCategoryInput(
  input: Pick<CreateCategoryInput, "name" | "description" | "color">,
): Pick<CreateCategoryInput, "name" | "description" | "color"> {
  const description = input.description?.trim() ?? null;

  return {
    name: input.name.trim(),
    description: description || null,
    ...(input.color === undefined ? {} : { color: input.color }),
  };
}

async function createCategory(
  apiClient: CategoriesApiClient,
  input: CreateCategoryInput,
): Promise<CategoryCatalogItem> {
  const response = await apiClient.post<unknown>(
    buildCategoryCollectionPath(input.spaceId),
    normalizeCategoryInput(input),
    { expectedStatuses: [201] },
  );

  return requireCategoryResponse(
    requireApiResponse(response, "created Category", createCategoriesError),
  );
}

function buildCategoryCollectionPath(spaceId?: string): string {
  return spaceId === undefined
    ? "/categories"
    : `/spaces/${encodeURIComponent(spaceId)}/categories`;
}

function buildCategoryBudgetPath(categoryId: string, spaceId?: string) {
  return `${buildCategoryPath(categoryId, spaceId)}/budget`;
}

function buildCategoryPath(categoryId: string, spaceId?: string) {
  return `${buildCategoryCollectionPath(spaceId)}/${encodeURIComponent(categoryId)}`;
}

function requireUpdatedCategory(
  response: unknown,
  categoryId: string,
  label: string,
): CategoryCatalogItem {
  const category = requireCategoryResponse(
    requireApiResponse(response, label, createCategoriesError),
  );

  if (category.id !== categoryId) {
    throw createCategoriesError(
      "The API returned an updated Category with the wrong identity.",
    );
  }

  return category;
}

function projectCategoryBudget(
  response: unknown,
  categoryId: string,
  label: string,
): CategoryBudget {
  const budget = requireBudgetResponse(
    requireApiResponse(response, label, createCategoriesError),
    createCategoriesError,
  );

  if (budget.categoryId !== categoryId) {
    throw createCategoriesError(
      "The API returned a Budget for another Category.",
    );
  }

  return {
    amount: budget.amount,
    period: budget.period,
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
  };
}

async function getCategoryBudget(
  apiClient: CategoriesApiClient,
  categoryId: string,
  signal?: AbortSignal,
  spaceId?: string,
): Promise<CategoryBudget | null> {
  try {
    const response = await apiClient.get<unknown>(
      buildCategoryBudgetPath(categoryId, spaceId),
      { signal, expectedStatuses: [200] },
    );
    return projectCategoryBudget(response, categoryId, "Category Budget");
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      error.code === "BUDGET_NOT_FOUND"
    ) {
      return null;
    }

    throw error;
  }
}

async function updateCategory(
  apiClient: CategoriesApiClient,
  input: UpdateCategoryInput,
): Promise<CategoryCatalogItem> {
  const response = await apiClient.patch<unknown>(
    buildCategoryPath(input.categoryId, input.spaceId),
    {
      ...normalizeCategoryInput(input),
      updatedAt: requireCategoryVersion(input.updatedAt),
    },
    { expectedStatuses: [200] },
  );
  const category = requireUpdatedCategory(
    response,
    input.categoryId,
    "updated Category",
  );

  return category;
}

async function updateCategoryStatus(
  apiClient: CategoriesApiClient,
  input: UpdateCategoryStatusInput,
): Promise<CategoryCatalogItem> {
  const response = await apiClient.patch<unknown>(
    buildCategoryPath(input.categoryId, input.spaceId),
    {
      isActive: input.isActive,
      updatedAt: requireCategoryVersion(input.updatedAt),
    },
    { expectedStatuses: [200] },
  );
  const category = requireUpdatedCategory(
    response,
    input.categoryId,
    "updated Category status",
  );
  if (category.isActive !== input.isActive) {
    throw createCategoriesError(
      "The API returned an updated Category with the wrong status.",
    );
  }

  return category;
}

async function saveCategoryBudget(
  apiClient: CategoriesApiClient,
  categoryId: string,
  amount: string,
  spaceId?: string,
  updatedAt?: string,
): Promise<CategoryBudget> {
  const response = await apiClient.put<unknown>(
    buildCategoryBudgetPath(categoryId, spaceId),
    {
      amount,
      period: "monthly",
      ...(updatedAt === undefined ? {} : { updatedAt }),
    },
    { expectedStatuses: [200, 201] },
  );
  const budget = projectCategoryBudget(response, categoryId, "created Budget");

  if (
    budget.amount !== amount ||
    budget.period !== "monthly"
  ) {
    throw createCategoriesError(
      "The API returned an invalid monthly Budget.",
    );
  }

  return budget;
}

async function deleteCategoryBudget(
  apiClient: CategoriesApiClient,
  categoryId: string,
  spaceId: string | undefined,
  updatedAt: string,
): Promise<void> {
  await apiClient.delete(buildCategoryBudgetPath(categoryId, spaceId), {
    headers: { "If-Match": requireCategoryVersion(updatedAt, "Budget") },
    expectedStatuses: [204],
  });
}

function requireCategoryVersion(
  value: string | null | undefined,
  resource = "Category",
) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new CategoriesDataError(
      `The current ${resource} version is unavailable. Reload and review your edits before saving.`,
    );
  }

  return normalized;
}

export {
  buildCategoryPath,
  buildCategoryBudgetPath,
  createCategory,
  saveCategoryBudget,
  CategoriesDataError,
  deleteCategoryBudget,
  getCategoryBudget,
  getCategoriesOverview,
  updateCategory,
  updateCategoryStatus,
};
export type {
  SaveCategoryBudgetInput,
  CreateCategoryInput,
  CategoryBudget,
  CategoryOverviewItem,
  CategoriesApiClient,
  CategoriesOverview,
  UpdateCategoryInput,
  UpdateCategoryStatusInput,
};
