// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientProvider } from "@/shared/api";

import { DashboardPage } from "./dashboard-page";

const dashboardState = vi.hoisted(() => ({
  period: "2026-08",
  query: {
    data: {
      summary: {
        period: "Aug 2026",
        totalSpend: 100,
        transactionCount: 1,
        recordedDayCount: 1,
        accountCount: 1,
        topCategory: "Housing",
        topCategoryAmount: 100,
        averagePerDay: 3.23,
        budgetUsed: 0,
        budgetRemaining: 0,
        budgetLimit: 0,
        budgetedSpend: 0,
        unbudgetedSpend: 100,
      },
      categorySpending: [
        {
          id: "category-housing",
          category: "housing",
          label: "Housing",
          color: "teal",
          amount: 100,
          share: 100,
        },
      ],
      recentTransactions: [],
      spendingPoints: [{ label: "1", amount: 100, categories: [{ id: "category-housing", label: "Housing", color: "teal", amount: 100 }] }],
      budgetAlerts: [{ categoryId: "category-housing", label: "Housing", spent: 100, budget: 80, remaining: -20, usage: 125, status: "over" }],
    },
    error: new Error("Dashboard query failed"),
    isError: false,
    isFetching: false,
    isPending: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/shared/reporting-period", () => ({
  ReportingPeriodFilter: () => <div>Reporting period filter</div>,
  useReportingPeriod: () => ({ period: dashboardState.period }),
}));

vi.mock("./dashboard-queries", () => ({
  useDashboardQuery: () => dashboardState.query,
}));

afterEach(cleanup);

const apiConfig = { baseUrl: "https://api.example.test" };
const getToken = vi.fn(async () => null);

function renderDashboard(onManageBudgets?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const view = render(
    <ApiClientProvider config={apiConfig} getToken={getToken}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage onManageBudgets={onManageBudgets} />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiClientProvider>,
  );

  return { ...view, queryClient };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    dashboardState.query.isFetching = false;
    dashboardState.query.isPlaceholderData = false;
  });

  it("shows Budget status without remaining amounts and links to all Transactions", () => {
    const summary = dashboardState.query.data.summary;
    const previous = { ...summary };
    Object.assign(summary, { budgetLimit: 200, budgetedSpend: 100, budgetUsed: 50 });
    try {
      renderDashboard();
      expect(screen.getByText("Within Budget")).toBeTruthy();
      expect(screen.queryByText(/remaining/)).toBeNull();
      expect(screen.getByRole("link", { name: "View all transactions" }).getAttribute("href")).toBe("/transactions");
      fireEvent.click(screen.getByRole("button", { name: "About Category attention" }));
      expect(screen.getByRole("tooltip").textContent).toContain("Categories at 80%");
      fireEvent.keyDown(screen.getByRole("button", { name: "About Category attention" }), { key: "Escape" });
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally { Object.assign(summary, previous); }
  });

  it("hides Manage Budgets when no Categories require attention", () => {
    const alerts = dashboardState.query.data.budgetAlerts;
    dashboardState.query.data.budgetAlerts = [];
    try {
      renderDashboard(() => undefined);
      expect(screen.getByText("Looking good! No Categories need attention yet.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Manage Budgets" })).toBeNull();
    } finally { dashboardState.query.data.budgetAlerts = alerts; }
  });
  it("removes categories from the previous Reporting Period while the next period loads", () => {
    const view = renderDashboard();
    expect(screen.getByRole("link", { name: /Housing.*Over Budget/ }).getAttribute("href")).toBe("/transactions?categoryId=category-housing");
    expect(
      screen.getByRole("img", { name: "Housing: 100% of monthly spending" }),
    ).toBeTruthy();

    dashboardState.period = "2026-09";
    dashboardState.query.isFetching = true;
    dashboardState.query.isPlaceholderData = true;
    view.rerender(
      <ApiClientProvider config={apiConfig} getToken={getToken}>
        <QueryClientProvider client={view.queryClient}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ApiClientProvider>,
    );

    expect(
      screen.queryByRole("img", {
        name: "Housing: 100% of monthly spending",
      }),
    ).toBeNull();
    expect(
      screen.getByText(
        "No categorized spending was recorded for this period.",
      ),
    ).toBeTruthy();
  });
});
