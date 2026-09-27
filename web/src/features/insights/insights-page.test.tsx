// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ApiClientProvider } from "@/shared/api";
import {
  formatReportingPeriod,
  getCurrentReportingPeriod,
  ReportingPeriodProvider,
  type ReportingPeriod,
} from "@/shared/reporting-period";
import { formatMoney } from "@/shared/money";

import { InsightsPage } from "./insights-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const getToken = vi.fn(async () => "session-token");
const apiConfig = { baseUrl: "https://api.example.test" };

function nextMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month!, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rollingStart(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 12, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function apiResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createSuccessfulFetch(initialPeriod: string) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1/users/me", "");
    const requestedSpaceId = path.match(/^\/spaces\/([^/]+)\//)?.[1] ?? "7";

    if (path.endsWith("/categories")) {
      if (requestedSpaceId === "8") {
        return apiResponse([
          {
            id: "80",
            name: "Housing",
            description: null,
            color: "violet",
            isActive: true,
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ]);
      }

      return apiResponse([
        {
          id: "42",
          name: "Groceries",
          description: null,
          color: "teal",
          isActive: true,
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "44",
          name: "Transit",
          description: null,
          color: "teal",
          isActive: true,
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ]);
    }

    if (path.endsWith("/category-summaries")) {
      if (requestedSpaceId === "8") {
        return apiResponse({
          period: "monthly",
          year: url.searchParams.get("year"),
          month: url.searchParams.get("month"),
          categories: [
            {
              categoryId: "80",
              name: "Housing",
              isActive: true,
              totalAmount: "8.40",
              transactionCount: "1",
              budgetAmount: "500.00",
              remainingAmount: "491.60",
            },
          ],
          uncategorizedTotal: "0.00",
          uncategorizedCount: "0",
        });
      }

      const amount = url.searchParams.get("year") === initialPeriod.slice(0, 4) &&
        url.searchParams.get("month") === initialPeriod.slice(5)
        ? "5.25"
        : "3.10";
      return apiResponse({
        period: "monthly",
        year: url.searchParams.get("year"),
        month: url.searchParams.get("month"),
          categories: [
          {
            categoryId: "42",
            name: "Groceries",
            isActive: true,
            totalAmount: amount,
            transactionCount: "1",
            budgetAmount: "100.00",
              remainingAmount: "94.75",
            },
            {
              categoryId: "44",
              name: "Transit",
              isActive: true,
              totalAmount: "0.00",
              transactionCount: "0",
              budgetAmount: null,
              remainingAmount: null,
            },
          ],
        uncategorizedTotal: "2.50",
        uncategorizedCount: "1",
      });
    }

    if (path.endsWith("/transactions")) {
      const fromDate = url.searchParams.get("fromDate")!;
      const toDate = url.searchParams.get("toDate")!;
      const selectedPeriod = toDate.slice(0, 7);
      if (requestedSpaceId === "8") {
        return apiResponse({
          items: [
            {
              id: `housing-${selectedPeriod}`,
              categoryId: "80",
              purchaseDate: `${selectedPeriod}-03`,
              description: "Rent",
              amount: "8.40",
              source: "manual",
              statementImportId: null,
            },
          ],
          nextCursor: null,
        });
      }

      const firstPeriod = fromDate.slice(0, 7);
      const secondPeriod = nextMonth(firstPeriod);
      const isInitialPeriod = selectedPeriod === initialPeriod;
      const day = isInitialPeriod ? "01" : "02";
      const categoryAmount = isInitialPeriod ? "5.25" : "3.10";
      return apiResponse({
        items: [
          {
            id: `at-budget-${firstPeriod}`,
            categoryId: "42",
            purchaseDate: `${firstPeriod}-10`,
            description: "At the current Budget",
            amount: "100.00",
            source: "manual",
            statementImportId: null,
          },
          {
            id: `over-budget-${secondPeriod}`,
            categoryId: "42",
            purchaseDate: `${secondPeriod}-10`,
            description: "Over the current Budget",
            amount: "100.01",
            source: "manual",
            statementImportId: null,
          },
          {
            id: `unbudgeted-${secondPeriod}`,
            categoryId: "44",
            purchaseDate: `${secondPeriod}-11`,
            description: "Unbudgeted transit",
            amount: "25.00",
            source: "manual",
            statementImportId: null,
          },
          {
            id: `uncategorized-${secondPeriod}`,
            categoryId: null,
            purchaseDate: `${secondPeriod}-12`,
            description: "Uncategorized purchase",
            amount: "0.05",
            source: "manual",
            statementImportId: null,
          },
          {
            id: `grocery-${selectedPeriod}`,
            categoryId: "42",
            purchaseDate: `${selectedPeriod}-${day}`,
            description: "Groceries",
            amount: categoryAmount,
            source: "manual",
            statementImportId: null,
          },
          ...(isInitialPeriod
            ? [
                {
                  id: `selected-uncategorized-${selectedPeriod}`,
                  categoryId: null,
                  purchaseDate: `${selectedPeriod}-${day}`,
                  description: "Uncategorized purchase",
                  amount: "2.50",
                  source: "manual",
                  statementImportId: null,
                },
              ]
            : []),
        ],
        nextCursor: null,
      });
    }

    throw new Error(`Unexpected API request to ${url.pathname}${url.search}`);
  });

  return fetch;
}

function renderInsights(spaceId = "7") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const renderPage = (selectedSpaceId: string) => (
    <ApiClientProvider config={apiConfig} getToken={getToken}>
      <QueryClientProvider client={queryClient}>
        <ReportingPeriodProvider>
          <MemoryRouter>
            <InsightsPage spaceId={selectedSpaceId} />
          </MemoryRouter>
        </ReportingPeriodProvider>
      </QueryClientProvider>
    </ApiClientProvider>
  );
  const view = render(renderPage(spaceId));

  return {
    ...view,
    rerenderSpace: (nextSpaceId: string) =>
      view.rerender(renderPage(nextSpaceId)),
  };
}

describe("InsightsPage", () => {
  it("shows daily totals, a labelled Budget pace, and updates when the month changes", async () => {
    const period = getCurrentReportingPeriod();
    const fetch = createSuccessfulFetch(period);
    vi.stubGlobal("fetch", fetch);
    renderInsights();

    expect(await screen.findByRole("heading", { name: "Insights" })).toBeTruthy();
    const summary = screen.getByRole("region", {
      name: "Monthly spending summary",
    });
    expect(within(summary).getByText("Total spending")).toBeTruthy();
    expect(within(summary).getByText("Budgeted Spending")).toBeTruthy();
    expect(within(summary).getByText(formatMoney(7.75))).toBeTruthy();
    expect(within(summary).getByText(formatMoney(5.25))).toBeTruthy();

    const breachList = screen.getByRole("list", {
      name: "Categories with the most monthly Budget breaches",
    });
    expect(within(breachList).getByText("Groceries")).toBeTruthy();
    expect(
      within(breachList).getByText("1 of 12 months over Budget"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Historical comparisons use current monthly Budgets/i),
    ).toBeTruthy();
    const lowSpendingList = screen.getByRole("list", {
      name: "Active monthly-budgeted Categories with the lowest spending",
    });
    expect(within(lowSpendingList).getByText("Groceries")).toBeTruthy();
    expect(
      within(lowSpendingList).getByText(`${formatMoney(5.25)} spent`),
    ).toBeTruthy();
    expect(
      within(lowSpendingList).getByText(`${formatMoney(100)} Budget`),
    ).toBeTruthy();

    const chartTable = screen.getByRole("table", {
      name: /daily spending values/i,
    });
    expect(within(chartTable).getAllByRole("row")).toHaveLength(
      new Date(
        Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0),
      ).getUTCDate() + 1,
    );
    expect(within(chartTable).getByRole("rowheader", { name: "1" })).toBeTruthy();
    expect(within(chartTable).getByRole("columnheader", { name: "Uncategorized" })).toBeTruthy();
    expect(
      within(chartTable).getByText(/pace guide, not a daily limit/i),
    ).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Budget pace" })).toBeTruthy();
    const trendsTable = screen.getByRole("table", {
      name: /category spending values/i,
    });
    const firstTrendDay = within(trendsTable).getByRole("rowheader", {
      name: `${period}-01`,
    });
    const firstTrendRow = firstTrendDay.closest("tr")!;
    expect(within(firstTrendRow).getByText(formatMoney(5.25))).toBeTruthy();
    const initialDayCount = new Date(
      Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0),
    ).getUTCDate();
    const paceHeaderIndex = within(trendsTable)
      .getAllByRole("columnheader")
      .findIndex(
        (header) => header.textContent === "Groceries daily Budget pace",
      );
    expect(paceHeaderIndex).toBeGreaterThan(0);
    expect(
      within(firstTrendRow).getAllByRole("cell")[paceHeaderIndex - 1]
        ?.textContent,
    ).toBe(formatMoney(100 / initialDayCount));

    fireEvent.change(screen.getByLabelText("Reporting period"), {
      target: { value: nextMonth(period) },
    });

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          String(input).includes(`fromDate=${rollingStart(nextMonth(period))}`),
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText(
        `Months over Budget in the 12-month window ending ${formatReportingPeriod(nextMonth(period) as ReportingPeriod)}.`,
      ),
    ).toBeTruthy();
    const nextSummary = screen.getByRole("region", {
      name: "Monthly spending summary",
    });
    expect(within(nextSummary).getAllByText(formatMoney(3.1))).toHaveLength(2);
    const nextTrendsTable = await screen.findByRole("table", {
      name: /category spending values/i,
    });
    const nextTrendDay = within(nextTrendsTable).getByRole("rowheader", {
      name: `${nextMonth(period)}-02`,
    });
    expect(
      within(nextTrendDay.closest("tr")!).getByText(formatMoney(3.1)),
    ).toBeTruthy();
  });

  it("filters daily Category trends by identity and shows Budget pace only when available", async () => {
    const period = getCurrentReportingPeriod();
    vi.stubGlobal("fetch", createSuccessfulFetch(period));
    renderInsights();

    const groceries = await screen.findByRole("button", { name: "Groceries" });
    const transit = screen.getByRole("button", { name: "Transit" });
    expect(groceries.getAttribute("aria-pressed")).toBe("true");
    expect(transit.getAttribute("aria-pressed")).toBe("false");

    let trendsTable = screen.getByRole("table", {
      name: /category spending values/i,
    });
    expect(
      within(trendsTable).getByRole("columnheader", {
        name: "Groceries daily Budget pace",
      }),
    ).toBeTruthy();
    const budgetToggle = screen.getByRole("checkbox", {
      name: "Category Budgets",
    });
    expect(budgetToggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(budgetToggle);
    expect(budgetToggle.getAttribute("aria-checked")).toBe("false");
    expect(
      within(trendsTable).queryByRole("columnheader", {
        name: "Groceries daily Budget pace",
      }),
    ).toBeNull();
    fireEvent.click(budgetToggle);

    fireEvent.click(transit);
    expect(transit.getAttribute("aria-pressed")).toBe("true");
    trendsTable = screen.getByRole("table", {
      name: /category spending values/i,
    });
    const dayCount = new Date(
      Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0),
    ).getUTCDate();
    expect(within(trendsTable).getAllByRole("row")).toHaveLength(dayCount + 1);
    const transitHeaderIndex = within(trendsTable)
      .getAllByRole("columnheader")
      .findIndex((header) => header.textContent === "Transit spending");
    expect(transitHeaderIndex).toBeGreaterThan(0);
    const dailyRows = within(trendsTable).getAllByRole("row").slice(1);
    expect(
      dailyRows.every(
        (row) =>
          within(row).getAllByRole("cell")[transitHeaderIndex - 1]
            ?.textContent === formatMoney(0),
      ),
    ).toBe(true);
    expect(
      within(trendsTable).getByRole("columnheader", {
        name: "Transit spending",
      }),
    ).toBeTruthy();
    expect(
      within(trendsTable).queryByRole("columnheader", {
        name: "Transit daily Budget pace",
      }),
    ).toBeNull();
    fireEvent.click(groceries);
    expect(groceries.getAttribute("aria-pressed")).toBe("false");
    expect(transit.getAttribute("aria-pressed")).toBe("true");
    trendsTable = screen.getByRole("table", {
      name: /category spending values/i,
    });
    expect(
      within(trendsTable).queryByRole("columnheader", {
        name: "Groceries spending",
      }),
    ).toBeNull();
    expect(
      within(trendsTable).getByRole("columnheader", {
        name: "Transit spending",
      }),
    ).toBeTruthy();
    expect(trendsTable.querySelector("caption")?.textContent).toContain(
      "No selected Category has a current monthly Budget reference.",
    );

    fireEvent.click(transit);
    expect(
      screen.getByRole("status").textContent,
    ).toContain("Select a Category to see its spending trend.");
  });

  it("updates Category trends when the selected Space changes", async () => {
    const period = getCurrentReportingPeriod();
    vi.stubGlobal("fetch", createSuccessfulFetch(period));
    const view = renderInsights("7");

    const groceriesTable = await screen.findByRole("table", {
      name: /category spending values/i,
    });
    expect(
      within(groceriesTable).getByRole("columnheader", {
        name: "Groceries spending",
      }),
    ).toBeTruthy();
    const firstLowSpendingList = screen.getByRole("list", {
      name: "Active monthly-budgeted Categories with the lowest spending",
    });
    expect(within(firstLowSpendingList).getByText("Groceries")).toBeTruthy();

    view.rerenderSpace("8");

    const housingTable = await screen.findByRole("table", {
      name: /category spending values/i,
    });
    expect(
      within(housingTable).getByRole("columnheader", {
        name: "Housing spending",
      }),
    ).toBeTruthy();
    const housingDay = within(housingTable).getByRole("rowheader", {
      name: `${period}-03`,
    });
    expect(
      within(housingDay.closest("tr")!).getByText(formatMoney(8.4)),
    ).toBeTruthy();
    expect(
      within(housingTable).queryByRole("columnheader", {
        name: "Groceries spending",
      }),
    ).toBeNull();
    const housingRanking = screen.getByRole("list", {
      name: "Active monthly-budgeted Categories with the lowest spending",
    });
    expect(within(housingRanking).getByText("Housing")).toBeTruthy();
    expect(
      within(housingRanking).getByText(`${formatMoney(8.4)} spent`),
    ).toBeTruthy();
    expect(within(housingRanking).queryByText("Groceries")).toBeNull();
  });

  it("keeps zero-spend days visible in an empty period", async () => {
    const period = getCurrentReportingPeriod();
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1/users/me", "");

      if (path === "/spaces/7/categories") return apiResponse([]);
      if (path === "/spaces/7/category-summaries") {
        return apiResponse({
          period: "monthly",
          year: period.slice(0, 4),
          month: period.slice(5),
          categories: [],
          uncategorizedTotal: "0.00",
          uncategorizedCount: "0",
        });
      }
      if (path === "/spaces/7/transactions") {
        return apiResponse({ items: [], nextCursor: null });
      }

      throw new Error(`Unexpected API request to ${url.pathname}${url.search}`);
    });
    vi.stubGlobal("fetch", fetch);
    renderInsights();

    expect(
      await screen.findByText("No spending was recorded for this month."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No monthly-budgeted Categories are available for comparison.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("No active Categories have a current monthly Budget."),
    ).toBeTruthy();
    const chartTable = screen.getByRole("table", {
      name: /daily spending values/i,
    });
    const summary = screen.getByRole("region", {
      name: "Monthly spending summary",
    });
    const dayCount = new Date(
      Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0),
    ).getUTCDate();
    expect(within(chartTable).getAllByRole("row")).toHaveLength(dayCount + 1);
    expect(within(summary).getAllByText(formatMoney(0))).toHaveLength(2);
  });

  it("explains when eligible Categories have no Budget breaches and includes zero spending", async () => {
    const period = getCurrentReportingPeriod();
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1/users/me", "");

      if (path === "/spaces/7/categories") {
        return apiResponse([
          {
            id: "42",
            name: "Emergency",
            description: null,
            color: "teal",
            isActive: true,
            updatedAt: "2026-09-01T00:00:00.000Z",
          },
        ]);
      }
      if (path === "/spaces/7/category-summaries") {
        return apiResponse({
          period: "monthly",
          year: period.slice(0, 4),
          month: period.slice(5),
          categories: [
            {
              categoryId: "42",
              name: "Emergency",
              isActive: true,
              totalAmount: "0.00",
              transactionCount: "0",
              budgetAmount: "100.00",
              remainingAmount: "100.00",
            },
          ],
          uncategorizedTotal: "0.00",
          uncategorizedCount: "0",
        });
      }
      if (path === "/spaces/7/transactions") {
        return apiResponse({ items: [], nextCursor: null });
      }

      throw new Error(`Unexpected API request to ${url.pathname}${url.search}`);
    });
    vi.stubGlobal("fetch", fetch);
    renderInsights();

    expect(
      await screen.findByText(
        `No Categories exceeded their current Budget in the 12-month window ending ${formatReportingPeriod(period)}.`,
      ),
    ).toBeTruthy();
    const lowSpendingList = screen.getByRole("list", {
      name: "Active monthly-budgeted Categories with the lowest spending",
    });
    expect(within(lowSpendingList).getByText("Emergency")).toBeTruthy();
    expect(
      within(lowSpendingList).getByText(`${formatMoney(0)} spent`),
    ).toBeTruthy();
    expect(
      within(lowSpendingList).getByText(`${formatMoney(100)} Budget`),
    ).toBeTruthy();
  });

  it("shows a retryable error when monthly data cannot be loaded", async () => {
    const fetch = vi.fn(async () =>
      apiResponse(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Insights are temporarily unavailable.",
            details: [],
          },
        },
        500,
      ),
    );
    vi.stubGlobal("fetch", fetch);
    renderInsights();

    expect(
      await screen.findByRole("heading", { name: "Unable to load this page" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("shows a loading state while monthly data is being fetched", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderInsights();

    expect(screen.getByRole("status").textContent).toContain("Loading Insights");
  });

  it("switches to a rolling Yearly report with accessible periods and Budget breach status", async () => {
    const period = getCurrentReportingPeriod();
    const fetch = createSuccessfulFetch(period);
    vi.stubGlobal("fetch", fetch);
    renderInsights();

    expect(await screen.findByRole("heading", { name: "Insights" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yearly view" }));

    const yearlyTable = await screen.findByRole("table", {
      name: /monthly spending values/i,
    });
    expect(
      screen.queryByRole("heading", { name: "Frequently over Budget" }),
    ).toBeNull();
    const expectedStart = rollingStart(period);
    expect(within(yearlyTable).getAllByRole("row")).toHaveLength(13);
    expect(
      within(yearlyTable).getByRole("rowheader", {
        name: formatReportingPeriod(expectedStart.slice(0, 7) as ReportingPeriod),
      }),
    ).toBeTruthy();
    expect(within(yearlyTable).getAllByText("Over Budget")).toHaveLength(1);
    expect(within(yearlyTable).getAllByText("Within Budget").length).toBeGreaterThan(0);
    const breachMarker = screen.getByTestId("yearly-over-budget-marker");
    expect(breachMarker.style.bottom).toBe("100%");
    expect(breachMarker.style.transform).toBe("translateY(-100%)");
    expect(within(yearlyTable).getByText(/uncategorized transactions/i)).toBeTruthy();
    expect(
      screen.getAllByText(/historical comparisons use current monthly Budgets/i)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Yearly spending" })).toBeTruthy();

    let categoryTrendsTable = await screen.findByRole("table", {
      name: /category spending values/i,
    });
    expect(within(categoryTrendsTable).getAllByRole("row")).toHaveLength(13);
    expect(
      within(categoryTrendsTable).getByRole("columnheader", {
        name: "Groceries monthly Budget",
      }),
    ).toBeTruthy();
    const budgetHeaderIndex = within(categoryTrendsTable)
      .getAllByRole("columnheader")
      .findIndex(
        (header) => header.textContent === "Groceries monthly Budget",
      );
    const firstCategoryMonth = within(categoryTrendsTable)
      .getAllByRole("row")
      .at(1)!;
    expect(
      within(firstCategoryMonth).getAllByRole("cell")[budgetHeaderIndex - 1]
        ?.textContent,
    ).toBe(formatMoney(100));
    const categoryBudgetToggle = screen.getByRole("checkbox", {
      name: "Category Budgets",
    });
    expect(categoryBudgetToggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(categoryBudgetToggle);
    categoryTrendsTable = screen.getByRole("table", {
      name: /category spending values/i,
    });
    expect(
      within(categoryTrendsTable).queryByRole("columnheader", {
        name: "Groceries monthly Budget",
      }),
    ).toBeNull();
    fireEvent.click(categoryBudgetToggle);

    const monthlyBudgetToggle = screen.getByRole("checkbox", {
      name: "Monthly Budget",
    });
    expect(monthlyBudgetToggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(monthlyBudgetToggle);
    expect(monthlyBudgetToggle.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.getByText(/monthly Budget comparison is hidden/i),
    ).toBeTruthy();
    fireEvent.click(monthlyBudgetToggle);

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          String(input).includes(`fromDate=${expectedStart}`),
        ),
      ).toBe(true),
    );

    fireEvent.change(screen.getByLabelText("Reporting period"), {
      target: { value: nextMonth(period) },
    });
    const nextStart = rollingStart(nextMonth(period));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          String(input).includes(`fromDate=${nextStart}`),
        ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "Monthly view" }));
    expect(
      await screen.findByRole("table", { name: /daily spending values/i }),
    ).toBeTruthy();
  });
});
