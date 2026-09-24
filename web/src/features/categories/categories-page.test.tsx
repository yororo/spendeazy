// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientProvider } from "@/shared/api";
import type { CategoryCatalogItem, CategoryColor } from "@/shared/category";
import {
  NavigationGuardProvider,
  useNavigationGuard,
  type NavigationAction,
} from "@/shared/navigation";
import { ReportingPeriodProvider } from "@/shared/reporting-period";

import { CategoriesPage } from "./categories-page";

const apiConfig = { baseUrl: "https://api.example.test" };

HTMLElement.prototype.scrollIntoView = vi.fn();

interface FetchOptions {
  readonly authoritativeBudget?: {
    readonly amount: string;
    readonly period: "monthly" | "yearly";
  } | null;
  readonly initialBudget?: {
    readonly amount: string;
    readonly period: "monthly" | "yearly";
  } | null;
  readonly additionalCategories?: readonly Omit<
    CategoryCatalogItem,
    "updatedAt"
  >[];
  readonly categorySpending?: Readonly<Record<string, string>>;
  readonly createdCategory?: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
  };
  readonly postResponse?: "duplicate" | "failed";
  readonly patchResponse?: "duplicate" | "validation" | "failed";
  readonly patchResponses?: readonly (
    "success" | "duplicate" | "validation" | "failed"
  )[];
  readonly patchDelayMs?: number;
  readonly statusResponses?: readonly ("success" | "failed")[];
  readonly statusDelayMs?: number;
  readonly deleteResponse?: "failed";
  readonly deleteResponses?: readonly ("success" | "failed")[];
  readonly budgetDetailResponses?: readonly (
    "success" | "failed" | "missing"
  )[];
  readonly budgetResponses?: readonly ("success" | "failed")[];
  readonly categoryRules?: readonly CategoryRuleFixture[];
  readonly categoryRulesLoadResponses?: readonly (
    "success" | "failed" | "malformed"
  )[];
  readonly categoryRulesReplacementResponses?: readonly (
    | "success"
    | "failed"
    | "conflict"
    | "stale"
    | "unsupported"
    | "malformed"
    | "network"
    | "wrong-category"
  )[];
}

interface CategoryRuleFixture {
  readonly id: string;
  readonly categoryId: string;
  readonly pattern: string;
  readonly matchType: "exact" | "contains";
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CategoriesPageRenderOptions {
  readonly spaceId?: string;
  readonly onSpaceChange?: (spaceId?: string) => void;
  readonly onNavigate?: NavigationAction;
}

type FetchMock = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiErrorResponse(message: string, status: number, code: string) {
  return jsonResponse({ error: { code, message, details: [] } }, status);
}

function createFetchMock(options: FetchOptions = {}) {
  const initialBudget =
    options.initialBudget === undefined
      ? { amount: "150.00", period: "monthly" as const }
      : options.initialBudget;
  const categories: CategoryCatalogItem[] = [
    {
      id: "42",
      name: "Housing",
      description: "A place to live",
      color: "plum",
      isActive: true,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    ...(options.additionalCategories ?? []).map((category) => ({
      ...category,
      updatedAt: "2026-09-01T00:00:00.000Z",
    })),
  ];
  const budgetAmounts = new Map<string, string>();
  if (initialBudget?.period === "monthly") {
    budgetAmounts.set("42", initialBudget.amount);
  }
  const budgetDetails = new Map([
    [
      "42",
      options.authoritativeBudget === undefined
        ? initialBudget
        : options.authoritativeBudget,
    ],
  ]);
  const budgetResponses = [...(options.budgetResponses ?? [])];
  const budgetDetailResponses = [...(options.budgetDetailResponses ?? [])];
  const patchResponses = [...(options.patchResponses ?? [])];
  const statusResponses = [...(options.statusResponses ?? [])];
  const deleteResponses = [
    ...(options.deleteResponses ??
      (options.deleteResponse === undefined ? [] : [options.deleteResponse])),
  ];
  const categoryRules = [...(options.categoryRules ?? [])];
  const categoryRulesLoadResponses = [
    ...(options.categoryRulesLoadResponses ?? []),
  ];
  const categoryRulesReplacementResponses = [
    ...(options.categoryRulesReplacementResponses ?? []),
  ];
  const fetchMock = vi.fn<FetchMock>(async (input, init) => {
    const requestUrl = new URL(input.toString());
    const userPath = "/api/v1/users/me";
    const path = requestUrl.pathname.slice(userPath.length);
    const method = init?.method ?? "GET";

    if (method === "GET" && path === "/spaces") {
      return jsonResponse([
        {
          id: "10",
          kind: "personal",
          status: "active",
          accessLevel: "write",
          members: [{ id: "1", name: "Ada Lovelace" }],
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "99",
          kind: "shared",
          status: "active",
          accessLevel: "write",
          members: [
            { id: "1", name: "Ada Lovelace" },
            { id: "2", name: "Grace Hopper" },
          ],
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ]);
    }

    if (
      method === "GET" &&
      (path === "/categories" || /^\/spaces\/[^/]+\/categories$/u.test(path))
    ) {
      return jsonResponse(categories);
    }

    if (
      method === "GET" &&
      (path === "/category-summaries" ||
        /^\/spaces\/[^/]+\/category-summaries$/u.test(path))
    ) {
      return jsonResponse({
        period: "monthly",
        year: requestUrl.searchParams.get("year"),
        month: requestUrl.searchParams.get("month"),
        categories: categories.map((category) => {
          const budget = budgetAmounts.get(category.id) ?? null;
          const spent =
            options.categorySpending?.[category.id] ??
            (category.id === "42" ? "100.00" : "0.00");

          return {
            categoryId: category.id,
            name: category.name,
            isActive: category.isActive,
            totalAmount: spent,
            transactionCount: category.id === "42" ? "1" : "0",
            budgetAmount: budget,
            remainingAmount:
              budget === null
                ? null
                : `${(Number(budget) - Number(spent)).toFixed(2)}`,
          };
        }),
        uncategorizedTotal: "0.00",
        uncategorizedCount: "0",
      });
    }

    const scopedCategoryRulesPath = /^\/spaces\/([^/]+)\/category-rules$/u.exec(
      path,
    );
    if (
      method === "GET" &&
      (path === "/category-rules" || scopedCategoryRulesPath)
    ) {
      const responseType = categoryRulesLoadResponses.shift() ?? "success";
      if (responseType === "failed") {
        return apiErrorResponse(
          "The Category Rules could not be loaded.",
          500,
          "INTERNAL_ERROR",
        );
      }
      if (responseType === "malformed") {
        return jsonResponse({ rules: categoryRules });
      }

      return scopedCategoryRulesPath
        ? jsonResponse({ rules: categoryRules, revision: "4" })
        : jsonResponse(categoryRules);
    }

    const categoryRulesPath =
      /^\/(?:spaces\/([^/]+)\/)?categories\/([^/]+)\/rules$/u.exec(path);
    if (method === "PUT" && categoryRulesPath) {
      const spaceId = categoryRulesPath[1];
      const categoryId = decodeURIComponent(categoryRulesPath[2]);
      const responseType =
        categoryRulesReplacementResponses.shift() ?? "success";
      if (responseType === "failed") {
        return apiErrorResponse(
          "The Category Rules could not be saved.",
          500,
          "INTERNAL_ERROR",
        );
      }
      if (responseType === "conflict") {
        return jsonResponse(
          {
            error: {
              code: "CATEGORY_RULE_PATTERN_ALREADY_EXISTS",
              message: "A matching pattern already belongs to Groceries.",
              details: [
                {
                  field: "/rules/0",
                  code: "not_unique",
                  message: "The pattern belongs to Category Groceries.",
                  categoryId: "77",
                  categoryName: "Groceries",
                },
              ],
            },
          },
          409,
        );
      }
      if (responseType === "stale") {
        return apiErrorResponse(
          "These Category Rules changed elsewhere. Reload and review your edits.",
          409,
          "STALE_EDIT",
        );
      }
      if (responseType === "unsupported") {
        return apiErrorResponse(
          "The Category Rules endpoint is not available.",
          404,
          "ROUTE_NOT_FOUND",
        );
      }
      if (responseType === "network") {
        throw new Error("The network is unavailable.");
      }
      const body = JSON.parse(String(init?.body)) as {
        rules: readonly {
          pattern: string;
          matchType: "exact" | "contains";
        }[];
      };
      const persistedRules = body.rules.map((rule, index) => ({
        id: String(100 + index),
        categoryId: responseType === "wrong-category" ? "77" : categoryId,
        pattern: rule.pattern,
        matchType: rule.matchType,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }));
      if (responseType === "malformed")
        return jsonResponse({ rules: persistedRules });
      categoryRules.splice(
        0,
        categoryRules.length,
        ...categoryRules.filter((rule) => rule.categoryId !== categoryId),
        ...persistedRules,
      );
      return spaceId
        ? jsonResponse({ rules: persistedRules, revision: "5" })
        : jsonResponse(persistedRules);
    }

    if (method === "POST" && path === "/categories") {
      if (options.postResponse === "duplicate") {
        return apiErrorResponse(
          "A Category with this name already exists.",
          409,
          "CATEGORY_NAME_ALREADY_EXISTS",
        );
      }
      if (options.postResponse === "failed") {
        return apiErrorResponse(
          "The Category could not be saved.",
          500,
          "INTERNAL_ERROR",
        );
      }

      const body = JSON.parse(String(init?.body)) as {
        name: string;
        description: string | null;
        color: CategoryColor;
      };
      const createdCategory = {
        id: options.createdCategory?.id ?? "99",
        name: options.createdCategory?.name ?? body.name,
        description: options.createdCategory?.description ?? body.description,
        color: body.color,
        isActive: true,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };
      categories.push(createdCategory);
      return jsonResponse(createdCategory, 201);
    }

    const categoryPath = /^\/categories\/([^/]+)$/u.exec(path);
    if (method === "PATCH" && categoryPath) {
      if (options.patchDelayMs !== undefined) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.patchDelayMs),
        );
      }
      const patchResponse = patchResponses.shift() ?? options.patchResponse;
      if (patchResponse === "duplicate") {
        return apiErrorResponse(
          "A Category with this name already exists.",
          409,
          "CATEGORY_NAME_ALREADY_EXISTS",
        );
      }
      if (patchResponse === "validation") {
        return apiErrorResponse(
          "The Category details are invalid.",
          400,
          "VALIDATION_FAILED",
        );
      }
      if (patchResponse === "failed") {
        return apiErrorResponse(
          "The Category details could not be saved.",
          500,
          "INTERNAL_ERROR",
        );
      }

      const categoryId = decodeURIComponent(categoryPath[1]);
      const categoryIndex = categories.findIndex(
        (category) => category.id === categoryId,
      );
      if (categoryIndex < 0) {
        return apiErrorResponse(
          "Category not found.",
          404,
          "CATEGORY_NOT_FOUND",
        );
      }

      const body = JSON.parse(String(init?.body)) as {
        name?: string;
        description?: string | null;
        color?: CategoryColor;
        isActive?: boolean;
      };
      if (body.isActive !== undefined) {
        if (options.statusDelayMs !== undefined) {
          await new Promise((resolve) =>
            setTimeout(resolve, options.statusDelayMs),
          );
        }
        if ((statusResponses.shift() ?? "success") === "failed") {
          return apiErrorResponse(
            "The Category status could not be saved.",
            500,
            "INTERNAL_ERROR",
          );
        }

        categories[categoryIndex] = {
          ...categories[categoryIndex],
          isActive: body.isActive,
        };
      }
      categories[categoryIndex] = {
        ...categories[categoryIndex],
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.description === undefined
          ? {}
          : { description: body.description }),
        ...(body.color === undefined ? {} : { color: body.color }),
      };
      return jsonResponse(
        {
          ...categories[categoryIndex],
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        200,
      );
    }

    const getBudgetPath = /^\/categories\/([^/]+)\/budget$/u.exec(path);
    if (method === "GET" && getBudgetPath) {
      const categoryId = decodeURIComponent(getBudgetPath[1]);
      const responseType =
        budgetDetailResponses.shift() ??
        (budgetDetails.get(categoryId) === null ? "missing" : "success");
      if (responseType === "failed") {
        return apiErrorResponse(
          "The Budget details could not be loaded.",
          500,
          "INTERNAL_ERROR",
        );
      }
      const budget = budgetDetails.get(categoryId) ?? null;
      if (budget === null || responseType === "missing") {
        return apiErrorResponse("Budget not found.", 404, "BUDGET_NOT_FOUND");
      }

      return jsonResponse({
        id: "7",
        categoryId,
        updatedAt: "2026-09-01T00:00:00.000Z",
        ...budget,
      });
    }

    const budgetPath = /^\/categories\/([^/]+)\/budget$/u.exec(path);
    if (method === "PUT" && budgetPath) {
      const categoryId = decodeURIComponent(budgetPath[1]);
      const responseType = budgetResponses.shift() ?? "success";
      if (responseType === "failed") {
        return apiErrorResponse(
          "The monthly Budget could not be saved.",
          500,
          "INTERNAL_ERROR",
        );
      }

      const body = JSON.parse(String(init?.body)) as { amount: string };
      budgetAmounts.set(categoryId, body.amount);
      budgetDetails.set(categoryId, {
        amount: body.amount,
        period: "monthly",
      });
      return jsonResponse(
        {
          id: "7",
          categoryId,
          amount: body.amount,
          period: "monthly",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        201,
      );
    }

    if (method === "DELETE" && budgetPath) {
      const categoryId = decodeURIComponent(budgetPath[1]);
      if ((deleteResponses.shift() ?? "success") === "failed") {
        return apiErrorResponse(
          "The monthly Budget could not be removed.",
          500,
          "INTERNAL_ERROR",
        );
      }
      budgetAmounts.delete(categoryId);
      budgetDetails.set(categoryId, null);
      return new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected ${method} ${path}`);
  });

  return { fetchMock, categories, budgetAmounts };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  });
}

function renderCategoriesPage(
  fetchMock: FetchMock,
  options: CategoriesPageRenderOptions = {},
) {
  const queryClient = createQueryClient();
  vi.stubGlobal("fetch", fetchMock);

  render(
    <NavigationGuardProvider>
      <ApiClientProvider
        config={apiConfig}
        getToken={vi.fn(async () => "session-token")}
      >
        <QueryClientProvider client={queryClient}>
          <ReportingPeriodProvider>
            <CategoriesPage
              spaceId={options.spaceId}
              onSpaceChange={options.onSpaceChange}
            />
          </ReportingPeriodProvider>
        </QueryClientProvider>
      </ApiClientProvider>
      {options.onNavigate && <NavigationProbe onNavigate={options.onNavigate} />}
    </NavigationGuardProvider>,
  );

  return queryClient;
}

function NavigationProbe({ onNavigate }: { readonly onNavigate: () => void }) {
  const { requestNavigation } = useNavigationGuard();

  return (
    <button
      type="button"
      onClick={() => {
        if (!requestNavigation(onNavigate)) onNavigate();
      }}
    >
      Switch Space
    </button>
  );
}

function getRequestBody(
  fetchMock: ReturnType<typeof createFetchMock>["fetchMock"],
  method: string,
) {
  const request = fetchMock.mock.calls.find(
    ([, init]) => init?.method === method,
  );
  return JSON.parse(String(request?.[1]?.body)) as Record<
    string,
    string | null
  >;
}

function getCategoryRuleReplacementRequests(
  fetchMock: ReturnType<typeof createFetchMock>["fetchMock"],
) {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      init?.method === "PUT" &&
      new URL(input.toString()).pathname.endsWith("/rules"),
  );
}

function getDesktopTable(options: { readonly hidden?: boolean } = {}) {
  return screen.getByRole("table", {
    name: "Desktop Budget Categories",
    ...options,
  });
}

function getMobileList(options: { readonly hidden?: boolean } = {}) {
  return screen.getByRole("list", {
    name: "Mobile Budget Categories",
    ...options,
  });
}

function getMobileCard(
  categoryName: string,
  options: { readonly hidden?: boolean } = {},
) {
  return within(getMobileList(options)).getByRole("listitem", {
    name: categoryName,
    ...options,
  });
}

function getDesktopEditButton(
  categoryName: string,
  options: { readonly hidden?: boolean } = {},
) {
  return within(getDesktopTable(options)).getByRole("button", {
    name: `Edit ${categoryName}`,
    ...options,
  });
}

function selectCategoryColor(colorGroup: HTMLElement, color: string) {
  fireEvent.click(
    within(colorGroup).getByRole("combobox", { name: "Category Color" }),
  );
  fireEvent.click(screen.getByRole("option", { name: color }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CategoriesPage", () => {
  it("shows the active Space above the title", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock, { spaceId: "99", onSpaceChange: vi.fn() });

    await screen.findByRole("heading", { name: "Budget overview" });
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Active Space" })).toBeNull();
  });

  it("presents a focused mobile Budget list and preserves the wider table", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Dining",
          description: "Restaurants and cafes",
          isActive: true,
        },
      ],
      categorySpending: { "77": "25.00" },
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });

    const summary = screen.getByRole("region", { name: "Budget summary" });
    expect(summary.textContent?.indexOf("Total monthly Budget")).toBeLessThan(
      summary.textContent?.indexOf("Spent") ?? -1,
    );
    expect(summary.textContent).toContain("Remaining");
    expect(summary.textContent).toContain("Categories");
    expect(screen.getByLabelText("Reporting period")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New Category" })).toBeTruthy();

    const mobileRegion = screen.getByRole("region", {
      name: "Mobile Budget category list",
    });
    const mobileList = within(mobileRegion).getByRole("list", {
      name: "Mobile Budget Categories",
    });
    const housingCard = within(mobileList).getByRole("listitem", {
      name: "Housing",
    });

    expect(within(housingCard).getByText("Monthly Budget")).toBeTruthy();
    expect(within(housingCard).getByText("₱150.00")).toBeTruthy();
    expect(within(housingCard).getByText("₱100.00")).toBeTruthy();
    expect(within(housingCard).getByText("₱50.00")).toBeTruthy();
    expect(
      within(housingCard).getByRole("progressbar", {
        name: "Housing: 67% used",
      }),
    ).toBeTruthy();
    expect(within(housingCard).getByText("67% used")).toBeTruthy();
    expect(within(housingCard).queryByText("A place to live")).toBeNull();

    const diningCard = within(mobileList).getByRole("listitem", {
      name: "Dining",
    });
    expect(within(diningCard).getByText("No monthly Budget")).toBeTruthy();
    expect(within(diningCard).getByText("₱25.00")).toBeTruthy();
    expect(within(diningCard).getByText("Not budgeted")).toBeTruthy();
    expect(within(diningCard).queryByText("Remaining")).toBeNull();
    expect(within(diningCard).queryByRole("progressbar")).toBeNull();

    const desktopRegion = screen.getByRole("region", {
      name: "Desktop Budget category table",
    });
    const desktopTable = within(desktopRegion).getByRole("table", {
      name: "Desktop Budget Categories",
    });
    expect(
      within(desktopTable).getByRole("columnheader", { name: "Usage" }),
    ).toBeTruthy();
    expect(within(desktopTable).getByText("A place to live")).toBeTruthy();
  });

  it("keeps combined filtering and empty guidance correct in the mobile list", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Archived Dining",
          description: "Historical spending",
          isActive: false,
        },
        {
          id: "88",
          name: "Travel",
          description: null,
          isActive: true,
        },
      ],
      categorySpending: { "77": "60.00", "88": "15.00" },
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const mobileRegion = screen.getByRole("region", {
      name: "Mobile Budget category list",
    });
    const mobileList = within(mobileRegion).getByRole("list", {
      name: "Mobile Budget Categories",
    });
    const search = screen.getByRole("searchbox", {
      name: "Search Category names",
    });
    const showInactive = screen.getByRole("checkbox", {
      name: "Show inactive Categories",
    });

    expect(within(mobileList).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(search, { target: { value: "Archived" } });
    expect(
      within(mobileRegion).getByText(
        "No active Categories match your search. Show inactive Categories to view them.",
      ),
    ).toBeTruthy();

    fireEvent.click(showInactive);
    expect(within(mobileList).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(mobileList).getByRole("listitem", { name: "Archived Dining" }),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    expect(within(mobileList).getAllByRole("listitem")).toHaveLength(3);
  });

  it("exposes Category Rules and an accessible mobile overflow menu", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const housingCard = getMobileCard("Housing");
    const matchingRulesButton = within(housingCard).getByRole("button", {
      name: "Category Rules for Housing",
    });
    expect(matchingRulesButton).toBeTruthy();

    const overflowTrigger = within(housingCard).getByRole("button", {
      name: "More actions for Housing",
    });
    fireEvent.keyDown(overflowTrigger, { key: "ArrowDown" });
    const menu = await within(housingCard).findByRole("menu", {
      name: "Actions for Housing",
    });
    const deactivateItem = within(menu).getByRole("menuitem", {
      name: "Deactivate Housing",
    });
    expect(document.activeElement).toBe(deactivateItem);

    fireEvent.keyDown(deactivateItem, { key: "Escape" });
    await waitFor(() =>
      expect(within(housingCard).queryByRole("menu")).toBeNull(),
    );
    expect(document.activeElement).toBe(overflowTrigger);

    fireEvent.click(overflowTrigger);
    fireEvent.pointerDown(document.body);
    await waitFor(() =>
      expect(within(housingCard).queryByRole("menu")).toBeNull(),
    );
    expect(document.activeElement).toBe(overflowTrigger);

    fireEvent.click(matchingRulesButton);
    expect(
      await screen.findByRole("heading", {
        name: /Matching rules.*Housing/,
      }),
    ).toBeTruthy();
  });

  it("deactivates a Category from the mobile overflow menu and restores focus after removal", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "88",
          name: "Travel",
          description: null,
          isActive: true,
        },
      ],
      statusDelayMs: 25,
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const showInactive = screen.getByRole("checkbox", {
      name: "Show inactive Categories",
    });
    const housingCard = getMobileCard("Housing");
    const overflowTrigger = within(housingCard).getByRole("button", {
      name: "More actions for Housing",
    });

    fireEvent.click(overflowTrigger);
    fireEvent.click(
      within(housingCard).getByRole("menuitem", {
        name: "Deactivate Housing",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Deactivate Housing?" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(overflowTrigger));
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(0);

    fireEvent.click(overflowTrigger);
    fireEvent.keyDown(
      within(housingCard).getByRole("menuitem", {
        name: "Deactivate Housing",
      }),
      { key: "Enter" },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Deactivate Category" }),
    );

    expect(
      await screen.findByRole("button", { name: /Deactivating Housing/ }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("searchbox", {
        name: "Search Category names",
        hidden: true,
      }),
    ).toHaveProperty("disabled", true);
    expect(
      within(getMobileCard("Travel", { hidden: true })).getByRole("button", {
        name: "More actions for Travel",
        hidden: true,
      }),
    ).toHaveProperty("disabled", true);

    await waitFor(() =>
      expect(screen.queryByRole("listitem", { name: "Housing" })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(showInactive));
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      isActive: false,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("reactivates an inactive Category directly from its mobile card", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Archived Dining",
          description: "Historical spending",
          isActive: false,
        },
      ],
      categorySpending: { "77": "60.00" },
      statusResponses: ["failed", "success"],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const showInactive = screen.getByRole("checkbox", {
      name: "Show inactive Categories",
    });
    fireEvent.click(showInactive);

    const archivedCard = getMobileCard("Archived Dining");
    const reactivateButton = within(archivedCard).getByRole("button", {
      name: "Reactivate Archived Dining",
    });
    fireEvent.click(reactivateButton);

    expect(
      await screen.findByText("Category status could not be saved."),
    ).toBeTruthy();
    expect(
      within(getMobileCard("Archived Dining")).getByRole("button", {
        name: "Reactivate Archived Dining",
      }),
    ).toBeTruthy();

    fireEvent.click(
      within(getMobileCard("Archived Dining")).getByRole("button", {
        name: "Reactivate Archived Dining",
      }),
    );
    await waitFor(() =>
      expect(
        within(getMobileCard("Archived Dining")).getByRole("button", {
          name: "Category Rules for Archived Dining",
        }),
      ).toBeTruthy(),
    );
    expect(
      within(getMobileCard("Archived Dining")).queryByRole("button", {
        name: "Reactivate Archived Dining",
      }),
    ).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(showInactive));
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      isActive: true,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("edits an active Category from its mobile card and restores focus after saving", async () => {
    const { fetchMock } = createFetchMock({
      authoritativeBudget: { amount: "200.00", period: "monthly" },
      additionalCategories: [
        {
          id: "88",
          name: "Travel",
          description: null,
          isActive: true,
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const mobileList = within(
      screen.getByRole("list", { name: "Mobile Budget Categories" }),
    );
    const housingCard = mobileList.getByRole("listitem", {
      name: "Housing",
    });
    const trigger = within(housingCard).getByRole("button", {
      name: "Edit Housing",
    });

    fireEvent.click(trigger);

    await screen.findByRole("dialog", {
      name: "Edit Housing",
    });
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    const dialog = screen.getByRole("dialog", { name: "Edit Housing" });
    expect(nameInput).toHaveProperty("value", "Housing");
    expect(
      screen.getByRole("textbox", {
        name: "Monthly Budget for Housing",
      }),
    ).toHaveProperty("value", "200.00");
    expect(
      screen.getByRole("searchbox", {
        name: "Search Category names",
        hidden: true,
      }),
    ).toHaveProperty("disabled", true);
    expect(
      within(
        mobileList.getByRole("listitem", { name: "Travel", hidden: true }),
      ).getByRole("button", { name: "Edit Travel", hidden: true }),
    ).toHaveProperty("disabled", true);

    fireEvent.change(nameInput, { target: { value: "Home" } });
    fireEvent.change(
      within(dialog).getByRole("textbox", {
        name: "Description for Housing",
      }),
      { target: { value: "Rent and mortgage" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Save changes to Housing",
      }),
    );

    await waitFor(() =>
      expect(
        within(
          screen.getByRole("list", { name: "Mobile Budget Categories" }),
        ).getByRole("listitem", { name: "Home" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("dialog", { name: "Edit Housing" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      name: "Home",
      description: "Rent and mortgage",
      color: "plum",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("saves a color-only edit and renders its swatch after reload", async () => {
    const { fetchMock } = createFetchMock({
      authoritativeBudget: { amount: "200.00", period: "monthly" },
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const mobileList = within(
      screen.getByRole("list", { name: "Mobile Budget Categories" }),
    );
    fireEvent.click(
      within(mobileList.getByRole("listitem", { name: "Housing" })).getByRole(
        "button",
        { name: "Edit Housing" },
      ),
    );

    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    const dialog = screen.getByRole("dialog", { name: "Edit Housing" });
    const colorGroup = within(dialog).getByRole("group", {
      name: "Category Color",
    });
    expect(
      within(colorGroup).getByRole("combobox", { name: "Category Color" })
        .textContent,
    ).toContain("Plum");

    fireEvent.click(
      within(colorGroup).getByRole("combobox", { name: "Category Color" }),
    );
    const colorOptions = await screen.findByRole("listbox");
    expect(within(colorOptions).getAllByRole("option")).toHaveLength(24);
    fireEvent.pointerDown(nameInput);
    fireEvent.click(nameInput);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

    selectCategoryColor(colorGroup, "Teal");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(
      within(colorGroup).getByText("Choose a named swatch. Selected: Teal."),
    ).toBeTruthy();
    const colorTrigger = within(colorGroup).getByRole("combobox", {
      name: "Category Color",
    });
    const selectedSwatches = colorTrigger.querySelectorAll(
      'span[aria-hidden="true"]',
    );
    expect(selectedSwatches).toHaveLength(1);
    expect(selectedSwatches[0]?.getAttribute("class")).toContain(
      "bg-category-teal",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes to Housing" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit Housing" })).toBeNull(),
    );
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      name: "Housing",
      description: "A place to live",
      color: "teal",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });

    cleanup();
    renderCategoriesPage(fetchMock);
    await screen.findByRole("heading", { name: "Budget overview" });
    const reloadedHousingCard = getMobileCard("Housing");
    const reloadedColorMarker = within(reloadedHousingCard)
      .getByText("Housing")
      .querySelector('[aria-hidden="true"]');
    expect(reloadedColorMarker).not.toBeNull();
    expect(reloadedColorMarker?.getAttribute("class")).toContain(
      "bg-category-teal",
    );
  });

  it("announces mobile Category edit validation errors without sending a mutation", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const mobileCard = within(
      screen.getByRole("list", { name: "Mobile Budget Categories" }),
    ).getByRole("listitem", { name: "Housing" });
    fireEvent.click(
      within(mobileCard).getByRole("button", { name: "Edit Housing" }),
    );

    await screen.findByRole("dialog", {
      name: "Edit Housing",
    });
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    const dialog = screen.getByRole("dialog", { name: "Edit Housing" });
    const descriptionInput = within(dialog).getByRole("textbox", {
      name: "Description for Housing",
    });
    fireEvent.change(nameInput, { target: { value: "x".repeat(101) } });
    fireEvent.change(descriptionInput, {
      target: { value: "d".repeat(501) },
    });
    fireEvent.change(
      within(dialog).getByRole("textbox", {
        name: "Monthly Budget for Housing",
      }),
      { target: { value: "0.00" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Save changes to Housing",
      }),
    );

    expect(
      within(dialog).getByText(
        "Category name must be 100 characters or fewer.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Description must be 500 characters or fewer."),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Budget must be a positive amount with at most two decimal places.",
      ),
    ).toBeTruthy();
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.getAttribute("aria-describedby")).toContain(
      "edit-category-42-name-error",
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["PATCH", "PUT", "DELETE"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("cancels mobile Category editing without changing the Category and restores focus", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const mobileList = within(
      screen.getByRole("list", { name: "Mobile Budget Categories" }),
    );
    const housingCard = mobileList.getByRole("listitem", {
      name: "Housing",
    });
    const trigger = within(housingCard).getByRole("button", {
      name: "Edit Housing",
    });
    fireEvent.click(trigger);

    await screen.findByRole("dialog", {
      name: "Edit Housing",
    });
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    const dialog = screen.getByRole("dialog", { name: "Edit Housing" });
    selectCategoryColor(
      within(dialog).getByRole("group", { name: "Category Color" }),
      "Teal",
    );
    fireEvent.change(nameInput, { target: { value: "Draft Housing" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    const closeDiscardDialog = await screen.findByRole("dialog", {
      name: "Discard Category changes?",
    });
    fireEvent.click(
      within(closeDiscardDialog).getByRole("button", {
        name: "Keep editing",
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const discardDialog = await screen.findByRole("dialog", {
      name: "Discard Category changes?",
    });
    fireEvent.click(
      within(discardDialog).getByRole("button", {
        name: "Discard changes",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit Housing" })).toBeNull(),
    );
    expect(
      within(
        screen.getByRole("list", { name: "Mobile Budget Categories" }),
      ).getByRole("listitem", { name: "Housing" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["PATCH", "PUT", "DELETE"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("keeps the mobile editor pending on save, preserves failures, and retries successfully", async () => {
    const { fetchMock } = createFetchMock({
      patchResponses: ["failed", "success"],
      patchDelayMs: 30,
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const mobileCard = within(
      screen.getByRole("list", { name: "Mobile Budget Categories" }),
    ).getByRole("listitem", { name: "Housing" });
    fireEvent.click(
      within(mobileCard).getByRole("button", { name: "Edit Housing" }),
    );
    await screen.findByRole("dialog", {
      name: "Edit Housing",
    });
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    const dialog = screen.getByRole("dialog", { name: "Edit Housing" });
    fireEvent.change(nameInput, { target: { value: "Home" } });
    selectCategoryColor(
      within(dialog).getByRole("group", { name: "Category Color" }),
      "Teal",
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Save changes to Housing",
      }),
    );

    const pendingSave = await screen.findByRole("button", {
      name: "Saving changes to Housing",
    });
    expect(pendingSave).toHaveProperty("disabled", true);
    expect(nameInput).toHaveProperty("disabled", true);
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveProperty("disabled", true);
    expect(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    ).toHaveProperty("disabled", true);

    await screen.findByText("Category details could not be saved");
    expect(screen.getByRole("dialog", { name: "Edit Housing" })).toBeTruthy();
    expect(nameInput).toHaveProperty("value", "Home");
    expect(
      within(
        within(screen.getByRole("dialog", { name: "Edit Housing" })).getByRole(
          "group",
          { name: "Category Color" },
        ),
      ).getByRole("combobox", { name: "Category Color" }).textContent,
    ).toContain("Teal");

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Save changes to Housing",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit Housing" })).toBeNull(),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(2);
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      name: "Home",
      description: "A place to live",
      color: "teal",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("creates a Category with all fields, creates a monthly Budget, and displays its description", async () => {
    const { fetchMock } = createFetchMock({
      createdCategory: {
        id: "99",
        name: "Dining Out",
        description: "Restaurants and cafes",
      },
      additionalCategories: [
        {
          id: "98",
          name: "Teal already in use",
          description: null,
          color: "teal",
          isActive: true,
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(screen.getByRole("button", { name: /New Category/ }));
    const colorGroup = screen.getByRole("group", { name: "Category Color" });
    const colorTrigger = within(colorGroup).getByRole("combobox", {
      name: "Category Color",
    });
    expect(colorTrigger.textContent).toContain("Coral");
    expect(colorTrigger).toHaveProperty("disabled", false);
    fireEvent.click(colorTrigger);
    const colorOptions = await screen.findByRole("listbox");
    expect(within(colorOptions).getAllByRole("option")).toHaveLength(24);
    fireEvent.click(within(colorOptions).getByRole("option", { name: "Teal" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(colorTrigger.textContent).toContain("Teal");
    fireEvent.change(screen.getByRole("textbox", { name: /^Category name/ }), {
      target: { value: "  Dining Out  " },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "  Restaurants and cafes  " },
    });
    fireEvent.change(screen.getByLabelText(/Monthly Budget/), {
      target: { value: "125.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(getRequestBody(fetchMock, "POST")).toEqual({
      name: "Dining Out",
      description: "Restaurants and cafes",
      color: "teal",
    });
    expect(getRequestBody(fetchMock, "PUT")).toEqual({
      amount: "125.50",
      period: "monthly",
    });
    expect(
      within(getDesktopTable()).getByText("Restaurants and cafes"),
    ).toBeTruthy();
    expect(within(getDesktopTable()).getByText("Dining Out")).toBeTruthy();
  });

  it("creates a name-only Category with a null description and refreshes dependent query data", async () => {
    const { fetchMock } = createFetchMock({
      createdCategory: {
        id: "99",
        name: "Cash",
        description: null,
      },
    });
    const queryClient = renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    queryClient.setQueryData(["dashboard", null, null, "2026-08"], { stale: false });
    queryClient.setQueryData(["transactions", null, null, "2026-08"], { stale: false });
    queryClient.setQueryData(["statement-import", "categories", null, null], {
      stale: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /New Category/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Category name/ }), {
      target: { value: " Cash " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(getRequestBody(fetchMock, "POST")).toEqual({
      name: "Cash",
      description: null,
      color: "coral",
    });
    expect(
      queryClient.getQueryState(["dashboard", null, null, "2026-08"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["transactions", null, null, "2026-08"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["statement-import", "categories", null, null])
        ?.isInvalidated,
    ).toBe(true);
    expect(within(getDesktopTable()).getByText("Cash")).toBeTruthy();
  });

  it("surfaces a case-insensitive duplicate-name error and keeps the form open", async () => {
    const { fetchMock } = createFetchMock({ postResponse: "duplicate" });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(screen.getByRole("button", { name: /New Category/ }));
    const nameInput = screen.getByRole("textbox", {
      name: /^Category name/,
    });
    fireEvent.change(nameInput, { target: { value: "housing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));

    await waitFor(() =>
      expect(
        screen.getByText("A Category with this name already exists."),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: /^Category name/ }),
    ).toHaveProperty("value", "housing");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
  });

  it("shows a failed Category save and preserves the creation form", async () => {
    const { fetchMock } = createFetchMock({ postResponse: "failed" });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(screen.getByRole("button", { name: /New Category/ }));
    const nameInput = screen.getByRole("textbox", {
      name: /^Category name/,
    });
    fireEvent.change(nameInput, { target: { value: "Travel" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));

    await waitFor(() =>
      expect(screen.getByText("The Category could not be saved.")).toBeTruthy(),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(nameInput).toHaveProperty("value", "Travel");
  });

  it("keeps the saved Category identified when the Budget fails and retries that Category without another POST", async () => {
    const { fetchMock } = createFetchMock({
      createdCategory: {
        id: "99",
        name: "Travel",
        description: "Trips",
      },
      budgetResponses: ["failed", "success"],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(screen.getByRole("button", { name: /New Category/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Category name/ }), {
      target: { value: "Travel" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Trips" },
    });
    fireEvent.change(screen.getByLabelText(/Monthly Budget/), {
      target: { value: "200.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));

    await screen.findByText("Category saved; Budget not saved");
    expect(screen.getByText(/Category “Travel” was created/)).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: /^Category name/ }),
    ).toHaveProperty("value", "Travel");
    expect(screen.getByRole("button", { name: "Retry Budget" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry Budget" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    const budgetRequests = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "PUT",
    );
    expect(budgetRequests).toHaveLength(2);
    expect(
      budgetRequests.map(([input]) => new URL(input.toString()).pathname),
    ).toEqual([
      "/api/v1/users/me/categories/99/budget",
      "/api/v1/users/me/categories/99/budget",
    ]);
  });

  it("asks before discarding changed form input and restores focus after discard", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const trigger = screen.getByRole("button", { name: /New Category/ });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("textbox", { name: /^Category name/ }), {
      target: { value: "Temporary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("heading", { name: "Discard new Category?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      screen.getByRole("textbox", { name: /^Category name/ }),
    ).toHaveProperty("value", "Temporary");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("protects a dirty new Category and Budget editor during a requested Space switch", async () => {
    const { fetchMock } = createFetchMock();
    const onNavigate = vi.fn();
    renderCategoriesPage(fetchMock, { onNavigate });

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(screen.getByRole("button", { name: /New Category/ }));
    const nameInput = screen.getByRole("textbox", { name: /^Category name/ });
    fireEvent.change(nameInput, {
      target: { value: "Unsaved Category" },
    });
    fireEvent.change(screen.getByLabelText(/Monthly Budget/), {
      target: { value: "125.00" },
    });
    nameInput.focus();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch Space", hidden: true }),
    );
    expect(
      screen.getByRole("dialog", { name: "Leave Category editor?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay in editor" }));
    expect(screen.getByRole("textbox", { name: /^Category name/ })).toHaveProperty(
      "value",
      "Unsaved Category",
    );
    expect(screen.getByLabelText(/Monthly Budget/)).toHaveProperty(
      "value",
      "125.00",
    );
    expect(document.activeElement).toBe(nameInput);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch Space", hidden: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("protects a dirty Category and Budget row during a requested Space switch", async () => {
    const { fetchMock } = createFetchMock();
    const onNavigate = vi.fn();
    renderCategoriesPage(fetchMock, { onNavigate });

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    const budgetInput = await screen.findByRole("textbox", {
      name: "Monthly Budget for Housing",
    });
    fireEvent.change(nameInput, { target: { value: "Unsaved Housing" } });
    fireEvent.change(budgetInput, { target: { value: "175.00" } });
    budgetInput.focus();

    fireEvent.click(screen.getByRole("button", { name: "Switch Space" }));
    expect(
      screen.getByRole("dialog", { name: "Leave Category editor?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay in editor" }));
    expect(nameInput).toHaveProperty("value", "Unsaved Housing");
    expect(budgetInput).toHaveProperty("value", "175.00");
    expect(document.activeElement).toBe(budgetInput);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Switch Space" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Category name for Housing" }),
      ).toBeNull(),
    );
  });

  it("closes an unchanged form directly with Escape", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const trigger = screen.getByRole("button", { name: /New Category/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("shows client validation errors without sending a Category request", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(screen.getByRole("button", { name: /New Category/ }));
    fireEvent.change(screen.getByLabelText(/Monthly Budget/), {
      target: { value: "0.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));

    expect(screen.getByText("Category name is required.")).toBeTruthy();
    expect(
      screen.getByText(
        "Budget must be a positive amount with at most two decimal places.",
      ),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("loads the authoritative monthly Budget before editing and saves exact Category changes", async () => {
    const { fetchMock } = createFetchMock({
      authoritativeBudget: { amount: "200.00", period: "monthly" },
    });
    const queryClient = renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    queryClient.setQueryData(["dashboard", null, null, "2026-09"], { stale: false });
    queryClient.setQueryData(["transactions", null, null, "2026-09"], { stale: false });
    queryClient.setQueryData(["statement-import", "categories", null, null], {
      stale: false,
    });
    fireEvent.click(getDesktopEditButton("Housing"));

    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    expect(nameInput).toHaveProperty("value", "Housing");
    expect(
      screen.getByRole("textbox", { name: "Monthly Budget for Housing" }),
    ).toHaveProperty("value", "200.00");

    fireEvent.change(nameInput, { target: { value: "  Home  " } });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Description for Housing" }),
      { target: { value: "  Rent and mortgage  " } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Monthly Budget for Housing" }),
      { target: { value: "225.5" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    await waitFor(() =>
      expect(within(getDesktopTable()).getByText("Home")).toBeTruthy(),
    );
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      name: "Home",
      description: "Rent and mortgage",
      color: "plum",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(getRequestBody(fetchMock, "PUT")).toEqual({
      amount: "225.50",
      period: "monthly",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(
      queryClient.getQueryState(["dashboard", null, null, "2026-09"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["transactions", null, null, "2026-09"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["statement-import", "categories", null, null])
        ?.isInvalidated,
    ).toBe(true);
    const firstBudgetGetIndex = fetchMock.mock.calls.findIndex(
      ([input, init]) =>
        init?.method === "GET" &&
        new URL(input.toString()).pathname.endsWith("/categories/42/budget"),
    );
    const patchIndex = fetchMock.mock.calls.findIndex(
      ([, init]) => init?.method === "PATCH",
    );
    expect(firstBudgetGetIndex).toBeGreaterThanOrEqual(0);
    expect(firstBudgetGetIndex).toBeLessThan(patchIndex);
  });

  it("clears a description and removes an existing monthly Budget", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    await screen.findByRole("textbox", {
      name: "Description for Housing",
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Description for Housing" }),
      { target: { value: "   " } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Monthly Budget for Housing" }),
      { target: { value: "" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    await waitFor(() =>
      expect(
        within(getDesktopTable()).getByText("No monthly Budget"),
      ).toBeTruthy(),
    );
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      name: "Housing",
      description: null,
      color: "plum",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          init?.method === "DELETE" &&
          new URL(input.toString()).pathname ===
            "/api/v1/users/me/categories/42/budget",
      ),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
  });

  it("adds a monthly Budget when the authoritative Budget endpoint reports none", async () => {
    const { fetchMock } = createFetchMock({ initialBudget: null });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    const budgetInput = await screen.findByRole("textbox", {
      name: "Monthly Budget for Housing",
    });
    expect(budgetInput).toHaveProperty("value", "");
    fireEvent.change(budgetInput, { target: { value: "75.25" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    await waitFor(() =>
      expect(screen.getAllByText("₱75.25").length).toBeGreaterThanOrEqual(1),
    );
    expect(getRequestBody(fetchMock, "PUT")).toEqual({
      amount: "75.25",
      period: "monthly",
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("keeps the editor and Budget draft after a partial save and retries without another Category PATCH", async () => {
    const { fetchMock } = createFetchMock({
      budgetResponses: ["failed", "success"],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search Category names" }),
      { target: { value: "Housing" } },
    );
    fireEvent.click(getDesktopEditButton("Housing"));
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    fireEvent.change(nameInput, { target: { value: "Rent" } });
    selectCategoryColor(
      screen.getByRole("group", { name: "Category Color" }),
      "Teal",
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Description for Housing" }),
      { target: { value: "Monthly home costs" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Monthly Budget for Housing" }),
      { target: { value: "225.00" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    await screen.findByText("Category details saved; Budget not saved");
    expect(
      screen.getByRole("textbox", { name: /Monthly Budget for/ }),
    ).toHaveProperty("value", "225.00");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      name: "Rent",
      description: "Monthly home costs",
      color: "teal",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Retry Budget/ }));
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /Category name for/ }),
      ).toBeNull(),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
    const budgetRequests = fetchMock.mock.calls.filter(
      ([input, init]) =>
        init?.method === "PUT" &&
        new URL(input.toString()).pathname ===
          "/api/v1/users/me/categories/42/budget",
    );
    expect(budgetRequests).toHaveLength(2);
  });

  it("surfaces a duplicate Category name from an inline edit and keeps the draft open", async () => {
    const { fetchMock } = createFetchMock({ patchResponse: "duplicate" });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    fireEvent.change(nameInput, { target: { value: "housing" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    await waitFor(() =>
      expect(
        screen.getAllByText("A Category with this name already exists.").length,
      ).toBeGreaterThanOrEqual(1),
    );
    expect(
      screen.getByRole("textbox", { name: /Category name for/ }),
    ).toHaveProperty("value", "housing");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["PUT", "DELETE"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("shows inline validation for invalid Category details and Budget input", async () => {
    const { fetchMock } = createFetchMock();
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Category name for Housing" }),
      { target: { value: "x".repeat(101) } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Description for Housing" }),
      { target: { value: "d".repeat(501) } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Monthly Budget for Housing" }),
      { target: { value: "0.00" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    expect(
      screen.getByText("Category name must be 100 characters or fewer."),
    ).toBeTruthy();
    expect(
      screen.getByText("Description must be 500 characters or fewer."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Budget must be a positive amount with at most two decimal places.",
      ),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["PATCH", "PUT", "DELETE"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("limits editing to one active row, disables filters, and confirms discarding a changed draft", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Archived",
          description: "Historical spending",
          isActive: false,
        },
        {
          id: "88",
          name: "Travel",
          description: null,
          isActive: true,
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    expect(screen.queryByRole("button", { name: "Edit Archived" })).toBeNull();
    fireEvent.click(getDesktopEditButton("Housing"));
    const nameInput = await screen.findByRole("textbox", {
      name: "Category name for Housing",
    });

    expect(
      screen.getByRole("searchbox", { name: "Search Category names" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Reporting period")).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "New Category" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(getDesktopEditButton("Travel")).toHaveProperty("disabled", true);

    fireEvent.change(nameInput, { target: { value: "Draft Housing" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel changes to Housing" }),
    );
    expect(
      screen.getByRole("heading", { name: "Discard Category changes?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      screen.getByRole("textbox", { name: /Category name for/ }),
    ).toHaveProperty("value", "Draft Housing");
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel changes to Housing" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /Category name for/ }),
      ).toBeNull(),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["PATCH", "PUT", "DELETE"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("preserves an unexpected yearly Budget while allowing Category details to be edited", async () => {
    const { fetchMock } = createFetchMock({
      initialBudget: { amount: "9999999999999.99", period: "yearly" },
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    await screen.findByText(
      "Yearly Budget is preserved; monthly editing is unavailable.",
    );
    expect(screen.getByText("₱9,999,999,999,999.99 / year")).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: "Monthly Budget for Housing" }),
    ).toBeNull();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Description for Housing" }),
      { target: { value: "Annual housing costs" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Annual housing costs")).toBeTruthy(),
    );
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      name: "Housing",
      description: "Annual housing costs",
      color: "plum",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["PUT", "DELETE"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);
  });

  it("recovers from a failed Budget removal after Category details were saved", async () => {
    const { fetchMock } = createFetchMock({
      deleteResponses: ["failed", "success"],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    await screen.findByRole("textbox", {
      name: "Monthly Budget for Housing",
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Description for Housing" }),
      { target: { value: "Updated home costs" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Monthly Budget for Housing" }),
      { target: { value: "" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes to Housing" }),
    );

    await screen.findByText("Category details saved; Budget not saved");
    expect(
      screen.getByRole("textbox", { name: /Monthly Budget for/ }),
    ).toHaveProperty("value", "");
    fireEvent.click(screen.getByRole("button", { name: /Retry Budget/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /Category name for/ }),
      ).toBeNull(),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(2);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
  });

  it("shows a retryable error when authoritative Budget details fail to load", async () => {
    const { fetchMock } = createFetchMock({
      budgetDetailResponses: ["failed", "success"],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(getDesktopEditButton("Housing"));
    await screen.findByText("Budget details could not be loaded");
    expect(
      screen.queryByRole("textbox", { name: "Monthly Budget for Housing" }),
    ).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        ["PATCH", "PUT", "DELETE"].includes(init?.method ?? ""),
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("textbox", {
      name: "Monthly Budget for Housing",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel changes to Housing" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: /Category name for/ }),
      ).toBeNull(),
    );
  });

  it("hides inactive Categories by default, combines visibility with search, and preserves totals", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Archived Dining",
          description: "Historical spending",
          isActive: false,
        },
      ],
      categorySpending: { "77": "60.00" },
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const showInactive = screen.getByRole("checkbox", {
      name: "Show inactive Categories",
    });
    expect(showInactive.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Archived Dining")).toBeNull();
    expect(screen.getByText("₱160.00")).toBeTruthy();

    const search = screen.getByRole("searchbox", {
      name: "Search Category names",
    });
    fireEvent.change(search, { target: { value: "Archived" } });
    expect(
      within(getDesktopTable()).getByText(
        "No active Categories match your search. Show inactive Categories to view them.",
      ),
    ).toBeTruthy();

    fireEvent.click(showInactive);
    expect(within(getDesktopTable()).getByText("Archived Dining")).toBeTruthy();
    expect(within(getDesktopTable()).getByText("Inactive")).toBeTruthy();
    expect(screen.getByText("₱160.00")).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    expect(within(getDesktopTable()).getByText("Housing")).toBeTruthy();
    expect(within(getDesktopTable()).getByText("Archived Dining")).toBeTruthy();
  });

  it("confirms deactivation, keeps cancel safe, preserves history, and restores focus when the row disappears", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "88",
          name: "Travel",
          description: null,
          isActive: true,
        },
      ],
      statusDelayMs: 25,
    });
    const queryClient = renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    queryClient.setQueryData(["dashboard", null, null, "2026-09"], { stale: false });
    queryClient.setQueryData(["transactions", null, null, "2026-09"], { stale: false });
    queryClient.setQueryData(["statement-import", "categories", null, null], {
      stale: false,
    });
    const showInactive = screen.getByRole("checkbox", {
      name: "Show inactive Categories",
    });
    fireEvent.click(showInactive);
    const deactivateButton = screen.getByRole("button", {
      name: "Deactivate Housing",
    });
    fireEvent.click(deactivateButton);

    expect(
      screen.getByRole("heading", { name: "Deactivate Housing?" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Historical Transactions and spending will remain, but Housing will stop being available for future Category assignments.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(deactivateButton));
    expect(
      screen.getByRole("button", { name: "Deactivate Housing" }),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(0);

    fireEvent.click(deactivateButton);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(deactivateButton));

    fireEvent.click(screen.getByRole("button", { name: "Deactivate Housing" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Deactivate Category" }),
    );
    expect(
      await screen.findByRole("button", { name: /Deactivating Housing/ }),
    ).toHaveProperty("disabled", true);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Edit Housing" })).toBeNull(),
    );
    expect(screen.getAllByText("₱100.00").length).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(document.activeElement).toBe(showInactive));
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      isActive: false,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(within(getDesktopTable()).getByText("Inactive")).toBeTruthy();
    expect(
      queryClient.getQueryState(["dashboard", null, null, "2026-09"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["transactions", null, null, "2026-09"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["statement-import", "categories", null, null])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("keeps a failed deactivation visible and active without reporting success", async () => {
    const { fetchMock } = createFetchMock({
      statusResponses: ["failed"],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Housing" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Deactivate Category" }),
    );

    await screen.findByText("The Category status could not be saved.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(getDesktopEditButton("Housing", { hidden: true })).toBeTruthy();
    expect(screen.queryByText("Inactive")).toBeNull();
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      isActive: false,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("reactivates an inactive Category immediately and exposes failure without changing its history", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Archived Dining",
          description: "Historical spending",
          isActive: false,
        },
      ],
      categorySpending: { "77": "60.00" },
      statusResponses: ["failed", "success"],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show inactive Categories" }),
    );
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Reactivate Archived Dining",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    await screen.findByText("Category status could not be saved.");
    expect(within(getDesktopTable()).getByText("Archived Dining")).toBeTruthy();
    expect(
      within(getDesktopTable()).getByRole("button", {
        name: "Reactivate Archived Dining",
      }),
    ).toBeTruthy();
    expect(getRequestBody(fetchMock, "PATCH")).toEqual({
      isActive: true,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });

    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Reactivate Archived Dining",
      }),
    );
    await waitFor(() =>
      expect(
        within(getDesktopTable()).getByRole("button", {
          name: "Edit Archived Dining",
        }),
      ).toBeTruthy(),
    );
    expect(within(getDesktopTable()).getByText("₱60.00")).toBeTruthy();
    expect(
      screen.queryByText("Category status could not be saved."),
    ).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(2);
    expect(
      fetchMock.mock.calls
        .filter(([, init]) => init?.method === "PATCH")
        .map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([
      { isActive: true, updatedAt: "2026-09-01T00:00:00.000Z" },
      { isActive: true, updatedAt: "2026-09-01T00:00:00.000Z" },
    ]);
  });

  it("shows inactive Categories without any editing action", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Archived",
          description: "Historical spending",
          isActive: false,
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show inactive Categories" }),
    );

    expect(within(getDesktopTable()).getByText("Inactive")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Archived" })).toBeNull();
    expect(
      within(getDesktopTable()).getByRole("button", {
        name: "Reactivate Archived",
      }),
    ).toBeTruthy();
  });

  it("loads Exact and Contains rules and replaces one Category rule set atomically", async () => {
    const { fetchMock } = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: " RENT   PAYMENT ",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "2",
          categoryId: "42",
          pattern: "MORTGAGE",
          matchType: "contains",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "3",
          categoryId: "77",
          pattern: "GROCERIES",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Matching rules · Housing",
      }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("textbox", { name: "Exact pattern 1" }),
    ).toHaveProperty("value", " RENT   PAYMENT ");
    expect(
      screen.getByRole("textbox", { name: "Contains pattern 1" }),
    ).toHaveProperty("value", "MORTGAGE");

    fireEvent.change(screen.getByRole("textbox", { name: "Exact pattern 1" }), {
      target: { value: "  RENT PAYMENT  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Contains Rule" }));
    const containsPatterns = screen.getAllByRole("textbox", {
      name: /Contains pattern/,
    });
    fireEvent.change(containsPatterns[1], {
      target: { value: "LANDLORD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

    await screen.findByText("Category Rules saved");
    const replacementRequests = fetchMock.mock.calls.filter(
      ([input, init]) =>
        init?.method === "PUT" &&
        new URL(input.toString()).pathname ===
          "/api/v1/users/me/categories/42/rules",
    );
    expect(replacementRequests).toHaveLength(1);
    expect(JSON.parse(String(replacementRequests[0]?.[1]?.body))).toEqual({
      rules: [
        { pattern: "  RENT PAYMENT  ", matchType: "exact" },
        { pattern: "MORTGAGE", matchType: "contains" },
        { pattern: "LANDLORD", matchType: "contains" },
      ],
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          (init?.method ?? "GET") === "GET" &&
          new URL(input.toString()).pathname.endsWith("/category-rules"),
      ),
    ).toHaveLength(2);
  });

  it("offers Category Rules only for active Categories and filters the collection to the selected Category", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Groceries",
          description: null,
          isActive: true,
        },
        {
          id: "88",
          name: "Archived",
          description: null,
          isActive: false,
        },
      ],
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "HOUSING",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "2",
          categoryId: "77",
          pattern: "MARKET",
          matchType: "contains",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "3",
          categoryId: "88",
          pattern: "ARCHIVE",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show inactive Categories" }),
    );
    expect(
      within(getDesktopTable()).queryByRole("button", {
        name: "Category Rules for Archived",
      }),
    ).toBeNull();

    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    await screen.findByRole("textbox", { name: "Exact pattern 1" });
    expect(screen.queryByDisplayValue("MARKET")).toBeNull();
    expect(screen.queryByDisplayValue("ARCHIVE")).toBeNull();
  });

  it("uses the explicit Space rule collection and revision-aware replacement", async () => {
    const { fetchMock } = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Rent",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock, { spaceId: "99" });

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    const exactPattern = await screen.findByRole("textbox", {
      name: "Exact pattern 1",
    });
    fireEvent.change(exactPattern, { target: { value: "Rent payment" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

    expect(await screen.findByText("Category Rules saved")).toBeTruthy();
    const getRequests = fetchMock.mock.calls.filter(
      ([input, init]) =>
        (init?.method ?? "GET") === "GET" &&
        new URL(input.toString()).pathname ===
          "/api/v1/users/me/spaces/99/category-rules",
    );
    expect(getRequests).toHaveLength(2);
    const replacementRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        init?.method === "PUT" &&
        new URL(input.toString()).pathname ===
          "/api/v1/users/me/spaces/99/categories/42/rules",
    );
    expect(replacementRequest).toBeDefined();
    expect(JSON.parse(String(replacementRequest?.[1]?.body))).toEqual({
      revision: "4",
      rules: [{ pattern: "Rent payment", matchType: "exact" }],
    });
  });

  it("rejects blank, overlong, and normalized duplicate patterns while allowing the other match type", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "77",
          name: "Groceries",
          description: null,
          isActive: true,
        },
      ],
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Housing",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "2",
          categoryId: "77",
          pattern: "  RENT  ",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    await screen.findByRole("textbox", { name: "Exact pattern 1" });

    fireEvent.click(screen.getByRole("button", { name: "Add Exact Rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Contains Rule" }));
    const exactPatterns = screen.getAllByRole("textbox", {
      name: /Exact pattern/,
    });
    const containsPatterns = screen.getAllByRole("textbox", {
      name: /Contains pattern/,
    });
    fireEvent.change(exactPatterns[1], { target: { value: " rEnT " } });
    fireEvent.change(containsPatterns[0], { target: { value: " RENT " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

    expect(
      (
        await screen.findAllByText(
          "This Exact pattern is already assigned to Category “Groceries”.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Contains pattern is duplicated in this Category."),
    ).toBeNull();
    expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(0);

    fireEvent.change(exactPatterns[1], { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));
    expect(await screen.findByText("Pattern is required.")).toBeTruthy();
    expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(0);

    fireEvent.change(exactPatterns[1], {
      target: { value: "x".repeat(501) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));
    expect(
      await screen.findByText("Pattern must be 500 characters or fewer."),
    ).toBeTruthy();
    expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(0);
  });

  it("includes retained rules for inactive Categories in duplicate validation", async () => {
    const { fetchMock } = createFetchMock({
      additionalCategories: [
        {
          id: "88",
          name: "Archived",
          description: null,
          isActive: false,
        },
      ],
      categoryRules: [
        {
          id: "1",
          categoryId: "88",
          pattern: "Past   Purchase",
          matchType: "contains",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    await screen.findByText("No Exact rules yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add Contains Rule" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Contains pattern 1" }),
      {
        target: { value: " past  purchase " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

    expect(
      await screen.findByText(
        "This Contains pattern is already assigned to Category “Archived”.",
      ),
    ).toBeTruthy();
    expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(0);
  });

  it("loads retryably and preserves a draft through a failed replacement and a successful retry", async () => {
    const { fetchMock } = createFetchMock({
      categoryRulesLoadResponses: ["failed", "success"],
      categoryRulesReplacementResponses: ["failed", "success"],
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Rent",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    await screen.findByText("Category Rules could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const exactPattern = await screen.findByRole("textbox", {
      name: "Exact pattern 1",
    });
    fireEvent.change(exactPattern, { target: { value: "Updated rent" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

    await screen.findByText("Category Rules could not be saved");
    expect(exactPattern).toHaveProperty("value", "Updated rent");
    expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry Save Rules" }));
    expect(await screen.findByText("Category Rules saved")).toBeTruthy();
    expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(2);
  });

  it("clears all rules in one request and confirms every changed dismissal route", async () => {
    const { fetchMock } = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Rent",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "2",
          categoryId: "42",
          pattern: "Mortgage",
          matchType: "contains",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    const trigger = within(getDesktopTable()).getByRole("button", {
      name: "Category Rules for Housing",
    });
    fireEvent.click(trigger);
    await screen.findByRole("textbox", { name: "Exact pattern 1" });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Exact rule 1" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Contains rule 1" }),
    );
    expect(screen.getByText("No Exact rules yet.")).toBeTruthy();
    expect(screen.getByText("No Contains rules yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));
    expect(await screen.findByText("Category Rules saved")).toBeTruthy();
    expect(
      JSON.parse(
        String(getCategoryRuleReplacementRequests(fetchMock)[0]?.[1]?.body),
      ),
    ).toEqual({
      rules: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    await screen.findByText("No Exact rules yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add Exact Rule" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(
      screen.getByRole("heading", { name: "Discard Category Rules changes?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(
      screen.getByRole("heading", { name: "Discard Category Rules changes?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(trigger);
    await screen.findByText("No Exact rules yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add Contains Rule" }));
    await waitFor(() => {
      fireEvent.pointerDown(document.body);
      fireEvent.click(document.body);
      expect(
        screen.getByRole("heading", {
          name: "Discard Category Rules changes?",
        }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("protects dirty Category Rules during a requested Space switch", async () => {
    const { fetchMock } = createFetchMock({
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Rent",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const onNavigate = vi.fn();
    renderCategoriesPage(fetchMock, { onNavigate });

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    const exactPattern = await screen.findByRole("textbox", {
      name: "Exact pattern 1",
    });
    fireEvent.change(exactPattern, { target: { value: "Unsaved Rent" } });
    exactPattern.focus();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch Space", hidden: true }),
    );
    expect(
      screen.getByRole("dialog", { name: "Leave Category Rule editor?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay in editor" }));
    expect(exactPattern).toHaveProperty("value", "Unsaved Rent");
    expect(document.activeElement).toBe(exactPattern);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch Space", hidden: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a server-reported conflicting Category and preserves the draft", async () => {
    const { fetchMock } = createFetchMock({
      categoryRulesReplacementResponses: ["conflict"],
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Rent",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock);

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    const exactPattern = await screen.findByRole("textbox", {
      name: "Exact pattern 1",
    });
    fireEvent.change(exactPattern, { target: { value: "Groceries" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

    await screen.findByText("Category Rules could not be saved");
    expect(screen.getByText(/Groceries/)).toBeTruthy();
    expect(exactPattern).toHaveProperty("value", "Groceries");
    expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(1);
  });

  it("asks the member to reload a stale Space rule edit", async () => {
    const { fetchMock } = createFetchMock({
      categoryRulesReplacementResponses: ["stale"],
      categoryRules: [
        {
          id: "1",
          categoryId: "42",
          pattern: "Rent",
          matchType: "exact",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    renderCategoriesPage(fetchMock, { spaceId: "99" });

    await screen.findByRole("heading", { name: "Budget overview" });
    fireEvent.click(
      within(getDesktopTable()).getByRole("button", {
        name: "Category Rules for Housing",
      }),
    );
    const exactPattern = await screen.findByRole("textbox", {
      name: "Exact pattern 1",
    });
    fireEvent.change(exactPattern, { target: { value: "New rent" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

    await screen.findByText("Category Rules changed elsewhere");
    expect(
      screen.getByRole("textbox", { name: "Exact pattern 1" }),
    ).toHaveProperty("value", "New rent");
    fireEvent.click(screen.getByRole("button", { name: "Reload Rules" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Exact pattern 1" }),
      ).toHaveProperty("value", "Rent"),
    );
  });

  it.each([
    ["malformed response", "malformed" as const],
    ["unsupported endpoint", "unsupported" as const],
    ["network failure", "network" as const],
  ])(
    "keeps the draft visible after a %s while saving",
    async (_, responseType) => {
      const { fetchMock } = createFetchMock({
        categoryRulesReplacementResponses: [responseType],
        categoryRules: [
          {
            id: "1",
            categoryId: "42",
            pattern: "Rent",
            matchType: "exact",
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
      });
      renderCategoriesPage(fetchMock);

      await screen.findByRole("heading", { name: "Budget overview" });
      fireEvent.click(
        within(getDesktopTable()).getByRole("button", {
          name: "Category Rules for Housing",
        }),
      );
      const exactPattern = await screen.findByRole("textbox", {
        name: "Exact pattern 1",
      });
      fireEvent.change(exactPattern, { target: { value: "Retry this draft" } });
      fireEvent.click(screen.getByRole("button", { name: "Save Rules" }));

      await screen.findByText("Category Rules could not be saved");
      expect(exactPattern).toHaveProperty("value", "Retry this draft");
      expect(getCategoryRuleReplacementRequests(fetchMock)).toHaveLength(1);
    },
  );
});
