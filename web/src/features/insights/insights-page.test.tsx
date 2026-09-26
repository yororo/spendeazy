// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ApiClientProvider } from "@/shared/api";
import {
  getCurrentReportingPeriod,
  ReportingPeriodProvider,
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

    if (path === "/spaces/7/categories") {
      return apiResponse([
        {
          id: "42",
          name: "Groceries",
          description: null,
          color: "teal",
          isActive: true,
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ]);
    }

    if (path === "/spaces/7/category-summaries") {
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
        ],
        uncategorizedTotal: "2.50",
        uncategorizedCount: "1",
      });
    }

    if (path === "/spaces/7/transactions") {
      const period = url.searchParams.get("fromDate")!.slice(0, 7);
      const isInitialPeriod = period === initialPeriod;
      const day = isInitialPeriod ? "01" : "02";
      const categoryAmount = isInitialPeriod ? "5.25" : "3.10";
      return apiResponse({
        items: [
          {
            id: `grocery-${period}`,
            categoryId: "42",
            purchaseDate: `${period}-${day}`,
            description: "Groceries",
            amount: categoryAmount,
            source: "manual",
            statementImportId: null,
          },
          ...(isInitialPeriod
            ? [
                {
                  id: `uncategorized-${period}`,
                  categoryId: null,
                  purchaseDate: `${period}-${day}`,
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

  const view = render(
    <ApiClientProvider config={apiConfig} getToken={getToken}>
      <QueryClientProvider client={queryClient}>
        <ReportingPeriodProvider>
          <MemoryRouter>
            <InsightsPage spaceId={spaceId} />
          </MemoryRouter>
        </ReportingPeriodProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );

  return view;
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

    fireEvent.change(screen.getByLabelText("Reporting period"), {
      target: { value: nextMonth(period) },
    });

    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([input]) =>
          String(input).includes(`fromDate=${nextMonth(period)}-01`),
        ),
      ).toBe(true),
    );
    const nextSummary = screen.getByRole("region", {
      name: "Monthly spending summary",
    });
    expect(within(nextSummary).getAllByText(formatMoney(3.1))).toHaveLength(2);
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
});
