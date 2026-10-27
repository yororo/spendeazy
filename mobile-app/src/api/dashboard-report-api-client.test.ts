import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardReportApiClient,
  readDashboardReport,
} from "./dashboard-report-api-client.ts";
import { requestFailure } from "./request-failure.ts";

const validReport = {
  range: {
    view: "monthly",
    fromDate: "2026-01-01",
    toDate: "2026-06-30",
    today: "2026-07-03",
    timezone: "Asia/Manila",
    currency: "PHP",
    configurationBasis: "current",
    inProgress: false,
    asOf: "2026-07-02T16:30:00.000Z",
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
      categoryId: "8",
      name: "Home",
      amount: "6400.00",
      expenseFilter: {
        fromDate: "2026-01-01",
        toDate: "2026-06-30",
        categoryId: "8",
      },
    },
    statementImports: {
      count: "1",
      latestConfirmedAt: "2026-05-31T16:00:00.000Z",
      filter: { fromDate: "2026-01-01", toDate: "2026-06-30" },
    },
  },
  monthlyExpenses: [],
  categoryExpenses: [],
  budgetChecks: { monthly: [], yearly: [] },
};

test("Dashboard adapter sends repeated chart filters and decodes exact report values", async (t) => {
  const client = createDashboardReportApiClient({
    baseUrl: "https://example.invalid",
    getAccessToken: async () => "token",
  });
  let requestUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    requestUrl = String(url);
    return Response.json(validReport);
  });

  const report = await client.getDashboardReport("42", {
    view: "monthly",
    endMonth: "2026-06",
    chartCategoryIds: ["8", "9"],
  });

  assert.equal(
    requestUrl,
    "https://example.invalid/api/v1/users/me/spaces/42/reporting/dashboard?view=monthly&endMonth=2026-06&chartCategoryId=8&chartCategoryId=9",
  );
  assert.equal(report.summary.planned.exact.numerator, "12000");
  assert.equal(report.summary.comparison.percentage?.amount, "4.2");
  assert.equal(report.summary.highestCategory?.expenseFilter.categoryId, "8");
});

test("Dashboard adapter rejects malformed exact values and missing chart points", () => {
  for (const payload of [
    {
      ...validReport,
      summary: {
        ...validReport.summary,
        planned: {
          ...validReport.summary.planned,
          exact: { numerator: "12.5", denominator: "1" },
        },
      },
    },
    { ...validReport, monthlyExpenses: null },
  ]) {
    assert.throws(
      () => readDashboardReport(payload),
      (cause) => requestFailure(cause) === "invalid-response",
    );
  }
});
