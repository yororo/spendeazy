import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadNativeView } from "../../../scripts/native-view-test.mjs";

const { hosts, View: DashboardView } = await loadNativeView(
  new URL("./dashboard-view.tsx", import.meta.url),
  "DashboardView",
);

const report = {
  range: {
    view: "monthly",
    fromDate: "2026-01-01",
    toDate: "2026-06-30",
    today: "2026-07-03",
    timezone: "Asia/Manila",
    currency: "PHP",
    configurationBasis: "current",
    inProgress: false,
    asOf: "2026-07-02T16:30:00Z",
  },
  summary: {
    actualAmount: "12500.00",
    expenseCount: "11",
    planned: {
      exact: { numerator: "12000", denominator: "1" },
      amount: "12000.00",
      months: 6,
      monthlyEquivalent: {
        exact: { numerator: "2000", denominator: "1" },
        amount: "2000.00",
      },
      annualEquivalent: {
        exact: { numerator: "24000", denominator: "1" },
        amount: "24000.00",
      },
    },
    comparison: {
      direction: "above_plan",
      difference: {
        exact: { numerator: "500", denominator: "1" },
        amount: "500.00",
      },
      percentage: {
        exact: { numerator: "25", denominator: "6" },
        amount: "4.2",
      },
    },
    highestCategory: {
      categoryId: "1",
      name: "Home",
      amount: "6400.00",
      expenseFilter: {
        fromDate: "2026-01-01",
        toDate: "2026-06-30",
        categoryId: "1",
      },
    },
    statementImports: {
      count: "1",
      latestConfirmedAt: "2026-05-31T16:00:00.000Z",
      filter: { fromDate: "2026-01-01", toDate: "2026-06-30" },
    },
  },
  monthlyExpenses: [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
  ].map((month, index) => {
    const lastDay = String(
      new Date(Date.UTC(2026, index + 1, 0)).getUTCDate(),
    ).padStart(2, "0");
    return {
      month,
      fromDate: `${month}-01`,
      toDate: `${month}-${lastDay}`,
      inProgress: false,
      actualAmount: index === 5 ? "1039.99" : "1000.00",
      expenseCount: "1",
      expenseFilter: { fromDate: `${month}-01`, toDate: `${month}-${lastDay}` },
    };
  }),
  categoryExpenses: [
    {
      categoryId: "1",
      name: "Home",
      isActive: true,
      iconKey: "house",
      colorKey: "emerald",
      actualAmount: "6400.00",
      expenseCount: "6",
      budget: { period: "monthly", amount: "1200.00" },
      months: [
        "2026-01",
        "2026-02",
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
      ].map((month, index) => {
        const lastDay = String(
          new Date(Date.UTC(2026, index + 1, 0)).getUTCDate(),
        ).padStart(2, "0");
        return {
          month,
          actualAmount: "1000.00",
          expenseCount: "1",
          budgetStatus: "normal",
          monthlyBudgetAmount: "1200.00",
          annualBudgetAmount: null,
          expenseFilter: {
            fromDate: `${month}-01`,
            toDate: `${month}-${lastDay}`,
            categoryId: "1",
          },
        };
      }),
    },
  ],
  budgetChecks: {
    monthly: [
      {
        categoryId: "1",
        name: "Home",
        budgetAmount: "1200.00",
        overBudgetMonths: 1,
        eligibleMonths: 6,
        expenseFilter: {
          fromDate: "2026-01-01",
          toDate: "2026-06-30",
          categoryId: "1",
        },
      },
    ],
    yearly: [
      {
        categoryId: "2",
        name: "Travel",
        year: "2026",
        actualAmount: "2100.00",
        limitAmount: "2400.00",
        status: "nearing",
        usageFromDate: "2026-01-01",
        usageToDate: "2026-07-03",
        expenseFilter: {
          fromDate: "2026-01-01",
          toDate: "2026-07-03",
          categoryId: "2",
        },
      },
    ],
  },
};

function render(patch = {}) {
  hosts.length = 0;
  const intents = [];
  const budgetIntents = [];
  const historyIntents = [];
  const controller = {
    active: { id: "4" },
    categories: [
      {
        id: "1",
        name: "Home",
        isActive: true,
        iconKey: "house",
        colorKey: "emerald",
        revision: "1",
      },
      {
        id: "2",
        name: "Travel",
        isActive: true,
        iconKey: "plane",
        colorKey: "violet",
        revision: "1",
      },
    ],
    categoriesLoading: false,
    view: "monthly",
    report,
    error: null,
    loading: false,
    refreshing: false,
    refresh: () => intents.push("refresh"),
    selectView: (view) => intents.push(view),
    monthlyEndMonth: null,
    year: null,
    movePeriod: (offset) => intents.push(offset),
    chartCategoryIds: [],
    toggleChartCategory: (id) => intents.push({ category: id }),
    clearChartCategories: () => intents.push("clear-chart"),
    ...patch,
  };
  const text = renderToStaticMarkup(
    React.createElement(DashboardView, {
      controller,
      spaceStatus: "Personal",
      onOpenExpenses: (filter) => intents.push(filter),
      onOpenBudgetCategory: (categoryId) => budgetIntents.push(categoryId),
      onOpenImportHistory: () => historyIntents.push("statement-import-history"),
    }),
  );
  return {
    text,
    intents,
    budgetIntents,
    historyIntents,
    find: (label) => hosts.find((host) => host.accessibilityLabel === label),
  };
}

test("Dashboard view renders PHP summaries, both charts, Budget checks and accessible drill-through", () => {
  const view = render();
  assert.match(view.text, /₱12,500\.00/);
  assert.match(view.text, /₱12,000\.00/);
  assert.match(view.text, /Spending by month/);
  assert.match(view.text, /Spending by Category/);
  assert.match(view.text, /Budget checks/);
  assert.match(view.text, /Jan – Jun 2026/);
  assert.match(view.text, /year to date/);
  const summaryTotal = view.find(
    "Actual spending ₱12,500.00, view Expenses",
  );
  assert.equal(summaryTotal.accessibilityRole, "button");
  summaryTotal.onPress();
  const monthlyPoint = view.find(
    "Jun actual ₱1,039.99, monthly plan ₱2,000.00. View Expenses",
  );
  assert.equal(monthlyPoint.accessibilityRole, "button");
  monthlyPoint.onPress();
  view.find("Highest Category Home, ₱6,400.00, view Expenses").onPress();
  view.find("Home, ₱6,400.00. View Expenses").onPress();
  view.find("Home, 1 over Budget months out of 6 completed months").onPress();
  view.find("Travel, 2026, ₱2,100.00 of ₱2,400.00, nearing").onPress();
  view.find("1 Statement Imports confirmed in this period").onPress();
  assert.deepEqual(view.intents, [
    { fromDate: "2026-01-01", toDate: "2026-06-30" },
    { fromDate: "2026-06-01", toDate: "2026-06-30" },
    { fromDate: "2026-01-01", toDate: "2026-06-30", categoryId: "1" },
    { fromDate: "2026-01-01", toDate: "2026-06-30", categoryId: "1" },
  ]);
  assert.deepEqual(view.budgetIntents, ["1", "2"]);
  assert.deepEqual(view.historyIntents, ["statement-import-history"]);
  assert.equal(
    view.find("Monthly Dashboard view").accessibilityState.selected,
    true,
  );
  assert.equal(view.find("Next period").accessibilityState.disabled, false);
});

test("Dashboard view exposes retry, view selection, period navigation, and chart Category controls", () => {
  const view = render({
    report: {
      ...report,
      range: { ...report.range, today: "2026-07-03", inProgress: true },
      monthlyExpenses: report.monthlyExpenses.map((item) => ({
        ...item,
        inProgress: false,
      })),
    },
    chartCategoryIds: ["1"],
  });
  view.find("Yearly Dashboard view").onPress();
  view.find("Previous period").onPress();
  view.find("Next period").onPress();
  view.find("All Categories").onPress();
  view.find("Home").onPress();
  assert.deepEqual(view.intents, [
    "yearly",
    -1,
    1,
    "clear-chart",
    { category: "1" },
  ]);

  const failed = render({
    report: null,
    error: "Could not reach Spendeazy.",
    loading: false,
  });
  assert.match(failed.text, /Could not reach Spendeazy/);
  failed.find("Try again").onPress();
  assert.deepEqual(failed.intents, ["refresh"]);
});

test("Monthly Budget checks show a dash when the selected range has no completed months", () => {
  const view = render({
    report: {
      ...report,
      budgetChecks: {
        ...report.budgetChecks,
        monthly: report.budgetChecks.monthly.map((check) => ({
          ...check,
          overBudgetMonths: 0,
          eligibleMonths: 0,
          expenseFilter: null,
        })),
      },
    },
  });
  assert.match(view.text, /—/);
  assert.doesNotMatch(view.text, /0 over Budget months out of 0/);
  assert.ok(view.find("Home, no completed months to check"));
});

test("Dashboard labels a zero Budget plan without a percentage", () => {
  const view = render({
    report: {
      ...report,
      summary: {
        ...report.summary,
        planned: {
          ...report.summary.planned,
          amount: "0.00",
          exact: { numerator: "0", denominator: "1" },
        },
        comparison: {
          direction: "no_plan",
          difference: {
            exact: { numerator: "12500", denominator: "1" },
            amount: "12500.00",
          },
          percentage: null,
        },
      },
    },
  });
  assert.match(view.text, /No plan set/);
  assert.doesNotMatch(view.text, /No plan set[^<]*%/);
});
