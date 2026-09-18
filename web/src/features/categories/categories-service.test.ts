import { describe, expect, it, vi } from "vitest";

import {
  ApiError,
  createApiClient,
  type CategorySummaryResponse,
} from "@/shared/api";
import {
  getDefaultCategoryColor,
  isCategoryColor,
} from "@/shared/category";
import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  createCategory,
  deleteCategoryBudget,
  getCategoryBudget,
  getCategoriesOverview,
  saveCategoryBudget,
  updateCategory,
  updateCategoryStatus,
  type CategoriesApiClient,
} from "./categories-service";
import { filterCategoriesByName } from "./categories-filter";
import type { CategoryOverviewItem } from "./categories-service";

const period = "2026-08" as ReportingPeriod;
const categoriesPath = "/categories";
const summaryPath =
  "/category-summaries?period=monthly&year=2026&month=08";

function createCategoryResponse(overrides: Record<string, unknown> = {}) {
  const response = {
    id: "42",
    name: "Housing",
    description: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };

  return {
    ...response,
    color:
      overrides.color === undefined
        ? getDefaultCategoryColor(String(response.id))
        : overrides.color,
  };
}

function createSummary(
  categories: CategorySummaryResponse["categories"],
): CategorySummaryResponse {
  return {
    period: "monthly",
    year: "2026",
    month: "08",
    categories,
    uncategorizedTotal: "0.00",
    uncategorizedCount: "0",
  };
}

type FetchMock = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const apiConfig = {
  baseUrl: "https://api.example.test",
};

const clerkSessionToken = "clerk-session-token";

function createCategoriesApiClient(responses: ReadonlyMap<string, unknown>) {
  const fetchMock = vi.fn<FetchMock>(async (input) => {
    const requestUrl = new URL(input.toString());
    const userPath = "/api/v1/users/me";
    if (!requestUrl.pathname.startsWith(`${userPath}/`)) {
      throw new Error(`Unexpected self-scoped path ${requestUrl.pathname}`);
    }
    const path = requestUrl.pathname.slice(userPath.length) + requestUrl.search;
    if (!responses.has(path)) {
      throw new Error(`Unexpected GET ${path}`);
    }

    return new Response(JSON.stringify(responses.get(path)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  return {
    apiClient: createApiClient(
      apiConfig,
      vi.fn(async () => clerkSessionToken),
      fetchMock,
    ),
    fetchMock,
  };
}

function createCategoryOverviewItem(
  overrides: Partial<CategoryOverviewItem> = {},
): CategoryOverviewItem {
  return {
    id: "42",
    name: "Housing",
    description: null,
    color: getDefaultCategoryColor(overrides.id ?? "42"),
    isActive: true,
    budget: 150,
    spent: 100,
    remaining: 50,
    usage: 67,
    ...overrides,
  };
}

describe("getCategoriesOverview", () => {
  it("loads the selected monthly summary and projects persisted Budget data by API Category ID", async () => {
    const responses = new Map<string, unknown>([
      [
        categoriesPath,
        [
          createCategoryResponse(),
          createCategoryResponse({
            id: "99",
            name: "Pet care",
            description: "Food and supplies",
          }),
          createCategoryResponse({ id: "77", name: "Archived", isActive: false }),
          createCategoryResponse({ id: "88", name: "Unbudgeted" }),
        ],
      ],
      [
        summaryPath,
        createSummary([
          {
            categoryId: "42",
            name: "Housing",
            isActive: true,
            totalAmount: "100.00",
            transactionCount: "2",
            budgetAmount: "150.00",
            remainingAmount: "50.00",
          },
          {
            categoryId: "99",
            name: "Pet care",
            isActive: true,
            totalAmount: "18.50",
            transactionCount: "1",
            budgetAmount: null,
            remainingAmount: null,
          },
          {
            categoryId: "77",
            name: "Archived",
            isActive: false,
            totalAmount: "60.00",
            transactionCount: "3",
            budgetAmount: "50.00",
            remainingAmount: "-10.00",
          },
        ]),
      ],
    ]);
    const { apiClient, fetchMock } = createCategoriesApiClient(responses);
    const controller = new AbortController();

    const overview = await getCategoriesOverview(
      apiClient,
      period,
      controller.signal,
    );

    expect(overview).toEqual({
      period,
      periodLabel: "Aug 2026",
      categories: [
        {
          id: "42",
          name: "Housing",
          description: null,
          color: "plum",
          isActive: true,
          budget: 150,
          spent: 100,
          remaining: 50,
          usage: 67,
        },
        {
          id: "99",
          name: "Pet care",
          description: "Food and supplies",
          color: "coral",
          isActive: true,
          budget: null,
          spent: 18.5,
          remaining: null,
          usage: null,
        },
        {
          id: "77",
          name: "Archived",
          description: null,
          color: "indigo",
          isActive: false,
          budget: 50,
          spent: 60,
          remaining: -10,
          usage: 120,
        },
        {
          id: "88",
          name: "Unbudgeted",
          description: null,
          color: "lime",
          isActive: true,
          budget: null,
          spent: 0,
          remaining: null,
          usage: null,
        },
      ],
      totalBudget: 200,
      totalSpent: 178.5,
      totalRemaining: 40,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        ([, options]) =>
          new Headers(options?.headers).get("Authorization") ===
          `Bearer ${clerkSessionToken}`,
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.map(([input]) => {
        const requestUrl = new URL(input.toString());
        return requestUrl.pathname.replace(
          "/api/v1/users/me",
          "",
        ) + requestUrl.search;
      }),
    ).toEqual(expect.arrayContaining([categoriesPath, summaryPath]));
    expect(
      fetchMock.mock.calls.every(
        ([, options]) => options?.signal === controller.signal,
      ),
    ).toBe(true);
  });
});

describe("Category creation", () => {
  it("trims the Category fields and persists a nullable description", async () => {
    const post = vi.fn(async () => ({
      id: "99",
      name: "Dining Out",
      description: "Restaurants and cafes",
      color: "teal",
      isActive: true,
    }));
    await expect(
      createCategory(
        { post } as unknown as CategoriesApiClient,
        {
          name: "  Dining Out  ",
          description: "  Restaurants and cafes  ",
          color: "teal",
        },
      ),
    ).resolves.toMatchObject({
      id: "99",
      name: "Dining Out",
      description: "Restaurants and cafes",
      isActive: true,
    });
    expect(post).toHaveBeenCalledWith(
      "/categories",
      {
        name: "Dining Out",
        description: "Restaurants and cafes",
        color: "teal",
      },
      { expectedStatuses: [201] },
    );
  });

  it("stores a blank description as null", async () => {
    const post = vi.fn(async () => ({
      id: "100",
      name: "Cash",
      description: null,
      isActive: true,
    }));

    await createCategory(
      { post } as unknown as CategoriesApiClient,
      { name: " Cash ", description: "   ", color: "rose" },
    );

    expect(post).toHaveBeenCalledWith(
      "/categories",
      { name: "Cash", description: null, color: "rose" },
      { expectedStatuses: [201] },
    );
  });
});

describe("Category Budget creation", () => {
  it("creates a monthly Budget through the Category-specific endpoint", async () => {
    const put = vi.fn(async () => ({
      id: "7",
      categoryId: "99",
      amount: "125.50",
      period: "monthly",
    }));
    await expect(
      saveCategoryBudget(
        { put } as unknown as CategoriesApiClient,
        "99",
        "125.50",
      ),
    ).resolves.toMatchObject({
      amount: "125.50",
      period: "monthly",
    });
    expect(put).toHaveBeenCalledWith(
      "/categories/99/budget",
      { amount: "125.50", period: "monthly" },
      { expectedStatuses: [200, 201] },
    );
  });

  it("rejects a Budget response for another Category or recurring period", async () => {
    const put = vi.fn(async () => ({
      id: "7",
      categoryId: "99",
      amount: "125.50",
      period: "yearly",
    }));

    await expect(
      saveCategoryBudget(
        { put } as unknown as CategoriesApiClient,
        "99",
        "125.50",
      ),
    ).rejects.toThrow("The API returned an invalid monthly Budget.");
  });
});

describe("Category editing", () => {
  it("loads an authoritative monthly or yearly Budget by Category ID", async () => {
    const signal = new AbortController().signal;
    const get = vi.fn(async () => ({
      id: "7",
      categoryId: "99",
      amount: "1200.00",
      period: "yearly" as const,
    }));

    await expect(
      getCategoryBudget({ get } as unknown as CategoriesApiClient, "99", signal),
    ).resolves.toEqual({
      amount: "1200.00",
      period: "yearly",
    });
    expect(get).toHaveBeenCalledWith(
      "/categories/99/budget",
      { signal, expectedStatuses: [200] },
    );
  });

  it("treats only the Budget-not-found response as an absent Budget", async () => {
    const get = vi.fn(async () => {
      throw new ApiError("Budget not found.", {
        kind: "http",
        status: 404,
        code: "BUDGET_NOT_FOUND",
      });
    });

    await expect(
      getCategoryBudget({ get } as unknown as CategoriesApiClient, "99"),
    ).resolves.toBeNull();
  });

  it("trims and persists updated Category details", async () => {
    const patch = vi.fn(async () => ({
      id: "99",
      name: "Dining Out",
      description: "Restaurants and cafes",
      color: "teal",
      isActive: true,
    }));

    await expect(
      updateCategory(
        { patch } as unknown as CategoriesApiClient,
        {
          categoryId: "99",
          name: "  Dining Out  ",
          description: "  Restaurants and cafes  ",
          color: "teal",
        },
      ),
    ).resolves.toMatchObject({
      id: "99",
      name: "Dining Out",
      description: "Restaurants and cafes",
    });
    expect(patch).toHaveBeenCalledWith(
      "/categories/99",
      {
        name: "Dining Out",
        description: "Restaurants and cafes",
        color: "teal",
      },
      { expectedStatuses: [200] },
    );
  });

  it("persists a Category status change without rewriting its details", async () => {
    const patch = vi.fn(async () => ({
      id: "99",
      name: "Dining Out",
      description: "Restaurants and cafes",
      isActive: false,
    }));

    await expect(
      updateCategoryStatus(
        { patch } as unknown as CategoriesApiClient,
        { categoryId: "99", isActive: false },
      ),
    ).resolves.toMatchObject({
      id: "99",
      isActive: false,
    });
    expect(patch).toHaveBeenCalledWith(
      "/categories/99",
      { isActive: false },
      { expectedStatuses: [200] },
    );
  });

  it("rejects a status response that does not match the requested lifecycle state", async () => {
    const patch = vi.fn(async () => ({
      id: "99",
      name: "Dining Out",
      description: "Restaurants and cafes",
      isActive: true,
    }));

    await expect(
      updateCategoryStatus(
        { patch } as unknown as CategoriesApiClient,
        { categoryId: "99", isActive: false },
      ),
    ).rejects.toThrow("The API returned an updated Category with the wrong status.");
  });

  it("deletes a Category Budget with the API's empty success response", async () => {
    const del = vi.fn(async () => undefined);

    await expect(
      deleteCategoryBudget(
        { delete: del } as unknown as CategoriesApiClient,
        "99",
      ),
    ).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith(
      "/categories/99/budget",
      { expectedStatuses: [204] },
    );
  });
});

describe("filterCategoriesByName", () => {
  it("searches Category names only and ignores case and surrounding whitespace", () => {
    const categories = [
      createCategoryOverviewItem({ id: "1", name: "Home" }),
      createCategoryOverviewItem({ id: "2", name: "Utilities" }),
    ];

    expect(filterCategoriesByName(categories, " home ")).toEqual([
      categories[0],
    ]);
    expect(filterCategoriesByName(categories, "power")).toEqual([]);
    expect(filterCategoriesByName(categories, "")).toEqual(categories);
  });
});

describe("Category Color identity", () => {
  it("resolves a stable named color for a Category without an explicit choice", () => {
    const color = getDefaultCategoryColor("user-defined-category-99");

    expect(color).toBe(
      getDefaultCategoryColor("user-defined-category-99"),
    );
    expect(isCategoryColor(color)).toBe(true);
  });
});
