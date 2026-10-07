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
  vi.useRealTimers();
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
      const fromDate = url.searchParams.get("fromDate") ?? rollingStart(url.searchParams.get("toDate")!.slice(0, 7));
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

describe("InsightsPage Ledger", () => {
  it("shows two monthly charts with exact recorded totals and current Budget references", async () => {
    const period = getCurrentReportingPeriod();
    vi.stubGlobal("fetch", createSuccessfulFetch(period));
    renderInsights();
    const chart = await screen.findByRole("slider", { name: "Monthly total spending chart" });
    expect(screen.queryByRole("button", { name: "Daily view" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Monthly view" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Selected-month recorded spending" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Month comparison" })).toBeNull();
    const table = screen.getByRole("table", { name: /Monthly total spending values/ });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getByRole("rowheader", { name: formatReportingPeriod(rollingStart(period).slice(0, 7) as ReportingPeriod) })).toBeTruthy();
    const rows = within(table).getAllByRole("row");
    expect(rows[2]!.textContent).toContain(formatMoney(125.06));
    expect(rows[2]!.textContent).toContain(formatMoney(100.01));
    expect(rows.at(-1)!.textContent).toContain(formatMoney(7.75));
    fireEvent.keyDown(chart, { key: "End" });
    expect(screen.getByRole("status").textContent).toContain(formatMoney(7.75));
    fireEvent.keyDown(chart, { key: "Escape" });
    const controls = screen.getAllByRole("checkbox", { name: "Show budget" });
    expect(controls).toHaveLength(2);
    controls.forEach(control => expect(control.getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(controls[0]!);
    expect(controls[0]!.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "About monthly total spending" }));
    expect(screen.getByRole("dialog", { name: "About monthly total spending" }).textContent).toContain("Budgeted Spending only");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss help" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("updates both charts and clears chart selection when the Reporting Period changes", async () => {
    const period = getCurrentReportingPeriod();
    const fetch = createSuccessfulFetch(period);
    vi.stubGlobal("fetch", fetch);
    renderInsights();
    fireEvent.keyDown(await screen.findByRole("slider", { name: "Monthly total spending chart" }), { key: "End" });
    expect(screen.getByRole("status").textContent).toContain(formatMoney(7.75));
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: nextMonth(period) } });
    await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes("toDate=" + nextMonth(period) + "-"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const table = screen.getByRole("table", { name: /Monthly total spending values/ });
    expect(within(table).getAllByRole("row").at(-1)!.textContent).toContain(formatMoney(3.1));
    const categoryTable = screen.getByRole("table", { name: /Monthly Category spending values/ });
    expect(within(categoryTable).getAllByRole("row").at(-1)!.textContent).toContain(formatMoney(3.1));
  });

  it("updates Category identity and clears selections when the Space changes", async () => {
    vi.stubGlobal("fetch", createSuccessfulFetch(getCurrentReportingPeriod()));
    const view = renderInsights();
    const line = await screen.findByRole("button", { name: "Groceries monthly spending" });
    fireEvent.keyDown(line, { key: "End" });
    expect(screen.getByRole("status").textContent).toContain("Groceries");
    view.rerenderSpace("8");
    await screen.findByRole("button", { name: "Housing monthly spending" });
    expect(screen.queryByRole("button", { name: "Groceries monthly spending" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    const table = screen.getByRole("table", { name: /Monthly total spending values/ });
    expect(within(table).getAllByRole("row").at(-1)!.textContent).toContain(formatMoney(8.4));
  });

  it("shows zero recorded spending and unavailable Category references in an empty window", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/categories")) return apiResponse([]);
      if (url.pathname.endsWith("/transactions")) return apiResponse({ items: [], nextCursor: null });
      return apiResponse({ period: "monthly", year: url.searchParams.get("year"), month: url.searchParams.get("month"), categories: [], uncategorizedTotal: "0.00", uncategorizedCount: "0" });
    }));
    renderInsights();
    expect(await screen.findByText("No spending was recorded in this 12-month window.")).toBeTruthy();
    expect(screen.getByText("No selected Category has a current monthly Budget reference.")).toBeTruthy();
    expect(screen.getAllByRole("checkbox", { name: "Show budget" }).every(control => control.hasAttribute("disabled"))).toBe(true);
    const table = screen.getByRole("table", { name: /Monthly total spending values/ });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getAllByRole("cell").every(cell => cell.textContent === formatMoney(0))).toBe(true);
  });

  it("explicitly inspects a month and restores focus without changing the Reporting Period", async () => {
    const period = getCurrentReportingPeriod();
    vi.stubGlobal("fetch", createSuccessfulFetch(period));
    renderInsights();
    await screen.findByRole("slider", { name: "Monthly total spending chart" });
    fireEvent.click(screen.getByText("Inspect monthly spending"));
    const button = screen.getByRole("button", { name: "Inspect " + formatReportingPeriod(period) });
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Total: " + formatMoney(7.75));
    expect(dialog.textContent).toContain("Groceries");
    expect((screen.getByLabelText("Reporting period") as HTMLInputElement).value).toBe(period);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("shows a retryable error when monthly data cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => apiResponse({ error: { code: "INTERNAL_ERROR", message: "Insights are temporarily unavailable.", details: [] } }, 500)));
    renderInsights();
    expect(await screen.findByRole("heading", { name: "Unable to load this page" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("shows a loading state while monthly data is being fetched", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    renderInsights();
    expect(screen.getByRole("status").textContent).toContain("Loading Insights");
  });
});

describe("Insights chart interactions", () => {
  it("inspects monthly totals, Category segments, and Uncategorized independently", async () => {
    vi.stubGlobal("fetch", createSuccessfulFetch(getCurrentReportingPeriod()));
    renderInsights();
    const chart = await screen.findByRole("slider", { name: "Monthly total spending chart" });
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1200, height: 1000 } as DOMRect);
    const columns = chart.querySelectorAll("[data-month-column]");
    columns.forEach((column, index) => vi.spyOn(column, "getBoundingClientRect").mockReturnValue({ left: index * 100, right: index * 100 + 96 } as DOMRect));
    fireEvent.click(chart, { clientX: 150, clientY: 500 });
    expect(screen.getByRole("status").textContent).toContain(formatMoney(125.06));
    fireEvent.click(chart, { clientX: 150, clientY: 995 });
    expect(screen.getByRole("status").textContent).toContain("Groceries");
    expect(screen.getByRole("status").textContent).toContain(formatMoney(100.01));
    fireEvent.click(chart, { clientX: 150, clientY: 988 });
    expect(screen.getByRole("status").textContent).toContain("Transit");
    expect(screen.getByRole("status").textContent).toContain(formatMoney(25));
    fireEvent.click(chart, { clientX: 150, clientY: 987.495 });
    expect(screen.getByRole("status").textContent).toContain("Uncategorized");
    expect(screen.getByRole("status").textContent).toContain(formatMoney(0.05));
    const legend = screen.getByText("Category legends").closest("details")!;
    expect(legend.open).toBe(false);
    expect(within(chart.parentElement!).getByText(formatMoney(10_000))).toBeTruthy();
  });

  it("toggles comparison colors and retains keyboard line inspection", async () => {
    vi.stubGlobal("fetch", createSuccessfulFetch(getCurrentReportingPeriod()));
    renderInsights();
    await screen.findByRole("slider", { name: "Monthly total spending chart" });
    const group = screen.getByRole("group", { name: "Categories to compare", hidden: true });
    const button = within(group).getByRole("button", { name: "Groceries", hidden: true });
    expect(button.style.backgroundColor).toBe("var(--category-teal)");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.style.backgroundColor).toBe("");
    fireEvent.click(button);
    expect(button.style.backgroundColor).toBe("var(--category-teal)");
    const line = screen.getByRole("button", { name: "Groceries monthly spending" });
    fireEvent.keyDown(line, { key: "End" });
    expect(screen.getByRole("status").textContent).toContain("Groceries");
  });
});
