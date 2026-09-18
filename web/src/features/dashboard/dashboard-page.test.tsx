// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
      spendingPoints: [{ label: "1", amount: 100 }],
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

describe("DashboardPage", () => {
  it("removes categories from the previous Reporting Period while the next period loads", () => {
    const view = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("img", { name: "Housing: 100% of monthly spending" }),
    ).toBeTruthy();

    dashboardState.period = "2026-09";
    dashboardState.query.isFetching = true;
    dashboardState.query.isPlaceholderData = true;
    view.rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
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
