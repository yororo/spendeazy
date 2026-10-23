import { describe, expect, it, vi } from "vitest";

import type { ApiRequestOptionsWithoutBody } from "@/shared/api";
import type { ReportingPeriod } from "@/shared/reporting-period";

import { getDashboard, type DashboardApiClient } from "./dashboard-service";

const period = "2026-08" as ReportingPeriod;
const summaryPath = "/category-summaries?period=monthly&year=2026&month=08";
const fullExpensesPath =
  "/expenses?fromDate=2026-08-01&toDate=2026-08-31&pageSize=100";
const secondExpensesPath =
  "/expenses?fromDate=2026-08-01&toDate=2026-08-31&pageSize=100&cursor=page-2";
const recentExpensesPath =
  "/expenses?fromDate=2026-08-01&toDate=2026-08-31&pageSize=5";
const scopedCategoryPath = "/spaces/7/categories";
const scopedSummaryPath =
  "/spaces/7/category-summaries?period=monthly&year=2026&month=08";
const scopedFullExpensesPath =
  "/spaces/7/expenses?fromDate=2026-08-01&toDate=2026-08-31&pageSize=100";
const scopedRecentExpensesPath =
  "/spaces/7/expenses?fromDate=2026-08-01&toDate=2026-08-31&pageSize=5";
const scopedStatementImportPath = "/spaces/7/statement-imports/statement-1";

function createCategoryCatalog() {
  return [
    {
      id: "42",
      name: "Housing",
      description: null,
      color: "teal",
      isActive: true,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "43",
      name: "Groceries",
      description: null,
      color: "forest",
      isActive: true,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];
}

function createEmptySummary() {
  return {
    period: "monthly",
    year: "2026",
    month: "08",
    categories: [],
    uncategorizedTotal: "0.00",
    uncategorizedCount: "0",
  };
}

function createApiClient(responses: ReadonlyMap<string, unknown>) {
  const allResponses = new Map<string, unknown>([
    ["/categories", createCategoryCatalog()],
    ...responses,
  ]);
  const get = vi.fn(
    async (path: string, options?: ApiRequestOptionsWithoutBody) => {
      void options;
      if (!allResponses.has(path)) {
        throw new Error(`Unexpected GET ${path}`);
      }

      return allResponses.get(path);
    },
  );

  return {
    apiClient: { get } as unknown as DashboardApiClient,
    get,
  };
}

describe("getDashboard", () => {
  it.each([
    ["799.99", null],
    ["800.00", "near"],
    ["999.99", "near"],
    ["1000.00", "limit"],
    ["1000.01", "over"],
  ])("uses exact cents for %s even with low aggregate usage", async (spent, status) => {
    const { apiClient } = createApiClient(new Map<string, unknown>([
      [summaryPath, { ...createEmptySummary(), categories: [
        { categoryId: "42", name: "Housing", isActive: true, totalAmount: spent, expenseCount: "1", budgetAmount: "1000.00", remainingAmount: null },
        { categoryId: "43", name: "Groceries", isActive: true, totalAmount: "0.00", expenseCount: "0", budgetAmount: "99000.00", remainingAmount: null },
      ] }],
      [fullExpensesPath, { items: [], nextCursor: null }],
      [recentExpensesPath, { items: [], nextCursor: null }],
    ]));
    const dashboard = await getDashboard(apiClient, period);
    expect(dashboard.summary.budgetUsed).toBeLessThan(2);
    expect(dashboard.budgetAlerts.map((alert) => alert.status)).toEqual(status === null ? [] : [status]);
    if (spent === "1000.01") expect(dashboard.budgetAlerts[0]?.remaining).toBe(-0.01);
  });

  it("loads Dashboard aggregates and recent Expenses from the selected Space", async () => {
    const responses = new Map<string, unknown>([
      [scopedCategoryPath, createCategoryCatalog()],
      [scopedSummaryPath, createEmptySummary()],
      [
        scopedFullExpensesPath,
        {
          items: [
            {
              id: "expense-1",
              categoryId: "42",
              purchaseDate: "2026-08-01",
              description: "Scoped imported expense",
              amount: "10.00",
              source: "imported",
              statementImportId: "statement-1",
            },
          ],
          nextCursor: null,
        },
      ],
      [scopedRecentExpensesPath, { items: [], nextCursor: null }],
      [
        scopedStatementImportPath,
        {
          id: "statement-1",
          fileName: "scoped.pdf",
          statementDate: "2026-08-01",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
    ]);
    const { apiClient, get } = createApiClient(responses);

    await getDashboard(apiClient, period, undefined, "7");

    expect(get).toHaveBeenCalledWith(scopedCategoryPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedSummaryPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedFullExpensesPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedRecentExpensesPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedStatementImportPath, {
      signal: undefined,
    });
  });

  it("projects persisted summary data, traverses expense pages, and joins recent expenses", async () => {
    const responses = new Map<string, unknown>([
      [
        summaryPath,
        {
          period: "monthly",
          year: "2026",
          month: "08",
          categories: [
            {
              categoryId: "42",
              name: "Housing",
              isActive: true,
              totalAmount: "100.00",
              expenseCount: "2",
              budgetAmount: "150.00",
              remainingAmount: "50.00",
            },
            {
              categoryId: "43",
              name: "Groceries",
              isActive: true,
              totalAmount: "30.00",
              expenseCount: "1",
              budgetAmount: null,
              remainingAmount: null,
            },
          ],
          uncategorizedTotal: "10.00",
          uncategorizedCount: "1",
        },
      ],
      [
        fullExpensesPath,
        {
          items: [
            {
              id: "expense-10",
              categoryId: "42",
              purchaseDate: "2026-08-31",
              description: "Monthly rent",
              amount: "70.00",
              source: "imported",
              statementImportId: "statement-1",
            },
            {
              id: "expense-9",
              categoryId: null,
              purchaseDate: "2026-08-30",
              description: "Cash lunch",
              amount: "10.00",
              source: "manual",
              statementImportId: null,
            },
          ],
          nextCursor: "page-2",
        },
      ],
      [
        secondExpensesPath,
        {
          items: [
            {
              id: "expense-8",
              categoryId: "43",
              purchaseDate: "2026-08-02",
              description: "Weekly groceries",
              amount: "30.00",
              source: "imported",
              statementImportId: "statement-2",
            },
            {
              id: "expense-7",
              categoryId: "42",
              purchaseDate: "2026-08-02",
              description: "Home supplies",
              amount: "30.00",
              source: "imported",
              statementImportId: "statement-3",
            },
          ],
          nextCursor: null,
        },
      ],
      [
        recentExpensesPath,
        {
          items: [
            {
              id: "expense-10",
              categoryId: "42",
              purchaseDate: "2026-08-31",
              description: "Monthly rent",
              amount: "70.00",
              source: "imported",
              statementImportId: "statement-1",
            },
            {
              id: "expense-9",
              categoryId: null,
              purchaseDate: "2026-08-30",
              description: "Cash lunch",
              amount: "10.00",
              source: "manual",
              statementImportId: null,
            },
            {
              id: "expense-8",
              categoryId: "43",
              purchaseDate: "2026-08-02",
              description: "Weekly groceries",
              amount: "30.00",
              source: "imported",
              statementImportId: "statement-2",
            },
          ],
          nextCursor: null,
        },
      ],
      [
        "/statement-imports/statement-1",
        {
          id: "statement-1",
          fileName: "visa-august.pdf",
          statementDate: "2026-08-31",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      [
        "/statement-imports/statement-2",
        {
          id: "statement-2",
          fileName: "visa-july.pdf",
          statementDate: "2026-07-31",
          bank: " bdo ",
          cardType: "VISA",
          importedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      [
        "/statement-imports/statement-3",
        {
          id: "statement-3",
          fileName: "amex-july.pdf",
          statementDate: "2026-07-31",
          bank: " bdo ",
          cardType: " amex ",
          importedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    ]);
    const { apiClient, get } = createApiClient(responses);
    const controller = new AbortController();

    const dashboard = await getDashboard(apiClient, period, controller.signal);

    expect(dashboard.summary).toEqual({
      period: "Aug 2026",
      totalSpend: 140,
      expenseCount: 4,
      recordedDayCount: 3,
      accountCount: 3,
      topCategory: "Housing",
      topCategoryAmount: 100,
      averagePerDay: 4.52,
      budgetUsed: 66.7,
      budgetRemaining: 50,
      budgetLimit: 150,
      budgetedSpend: 100,
      unbudgetedSpend: 40,
    });
    expect(dashboard.categorySpending).toEqual([
      {
        id: "42",
        category: "housing",
        label: "Housing",
        color: "teal",
        amount: 100,
        share: 71.4,
      },
      {
        id: "43",
        category: "groceries",
        label: "Groceries",
        color: "forest",
        amount: 30,
        share: 21.4,
      },
    ]);
    expect(dashboard.budgetAlerts).toEqual([
      {
        categoryId: "43",
        label: "Groceries",
        spent: 30,
        budget: null,
        remaining: null,
        usage: null,
        status: "unbudgeted",
      },
    ]);
    expect(dashboard.spendingPoints[1]).toEqual({ label: "2", amount: 60, categories: [{ id: "42", label: "Housing", color: "teal", amount: 30 }, { id: "43", label: "Groceries", color: "forest", amount: 30 }] });
    expect(dashboard.spendingPoints[29]).toEqual({ label: "30", amount: 10, categories: [{ id: null, label: "Uncategorized", color: null, amount: 10 }] });
    expect(dashboard.spendingPoints[30]).toEqual({ label: "31", amount: 70, categories: [{ id: "42", label: "Housing", color: "teal", amount: 70 }] });
    expect(dashboard.recentExpenses).toEqual([
      {
        id: "expense-10",
        categoryId: "42",
        purchaseDate: "2026-08-31",
        date: "Aug 31",
        description: "Monthly rent",
        category: "housing",
        categoryLabel: "Housing",
        categoryColor: "teal",
        account: "BDO · AMEX",
        amount: -70,
        source: "imported",
        statementImportId: "statement-1",
      },
      {
        id: "expense-9",
        categoryId: null,
        purchaseDate: "2026-08-30",
        date: "Aug 30",
        description: "Cash lunch",
        category: "other",
        categoryLabel: "Uncategorized",
        categoryColor: null,
        account: "Cash",
        amount: -10,
        source: "manual",
        statementImportId: null,
      },
      {
        id: "expense-8",
        categoryId: "43",
        purchaseDate: "2026-08-02",
        date: "Aug 02",
        description: "Weekly groceries",
        category: "groceries",
        categoryLabel: "Groceries",
        categoryColor: "forest",
        account: "bdo · VISA",
        amount: -30,
        source: "imported",
        statementImportId: "statement-2",
      },
    ]);

    expect(get).toHaveBeenCalledWith(summaryPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith("/categories", {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(fullExpensesPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(secondExpensesPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(recentExpensesPath, {
      signal: controller.signal,
    });
    expect(
      get.mock.calls.filter(([path]) => path.startsWith("/statement-imports/")),
    ).toHaveLength(3);
    expect(
      get.mock.calls.every(
        ([, options]) => options?.signal === controller.signal,
      ),
    ).toBe(true);
  });

  it("fails explicitly when an imported Expense has no Statement Import ID", async () => {
    const responses = new Map<string, unknown>([
      [
        summaryPath,
        {
          ...createEmptySummary(),
          uncategorizedTotal: "10.00",
          uncategorizedCount: "1",
        },
      ],
      [
        fullExpensesPath,
        {
          items: [
            {
              id: "expense-without-import",
              categoryId: null,
              purchaseDate: "2026-08-01",
              description: "Invalid imported Expense",
              amount: "10.00",
              source: "imported",
              statementImportId: null,
            },
          ],
          nextCursor: null,
        },
      ],
      [recentExpensesPath, { items: [], nextCursor: null }],
    ]);
    const { apiClient, get } = createApiClient(responses);

    await expect(getDashboard(apiClient, period)).rejects.toMatchObject({
      kind: "data",
      message:
        "Imported Expense expense-without-import is missing its Statement Import ID.",
    });
    expect(get.mock.calls).not.toContainEqual([
      "/statement-imports/undefined",
      { signal: undefined },
    ]);
  });

  it("fails explicitly when a referenced Statement Import cannot be loaded", async () => {
    const importedExpense = {
      id: "expense-404",
      categoryId: null,
      purchaseDate: "2026-08-01",
      description: "Missing import",
      amount: "10.00",
      source: "imported",
      statementImportId: "statement-404",
    };
    const responses = new Map<string, unknown>([
      [
        summaryPath,
        {
          ...createEmptySummary(),
          uncategorizedTotal: "10.00",
          uncategorizedCount: "1",
        },
      ],
      [
        fullExpensesPath,
        { items: [importedExpense], nextCursor: null },
      ],
      [
        recentExpensesPath,
        { items: [importedExpense], nextCursor: null },
      ],
    ]);
    const { apiClient } = createApiClient(responses);

    await expect(getDashboard(apiClient, period)).rejects.toMatchObject({
      kind: "data",
      message: expect.stringContaining(
        "Unable to load Statement Import statement-404",
      ),
    });
  });

  it("preserves an empty Reporting Period as an empty Dashboard", async () => {
    const responses = new Map<string, unknown>([
      [summaryPath, createEmptySummary()],
      [fullExpensesPath, { items: [], nextCursor: null }],
      [recentExpensesPath, { items: [], nextCursor: null }],
    ]);
    const { apiClient } = createApiClient(responses);

    const dashboard = await getDashboard(apiClient, period);

    expect(dashboard.summary).toEqual({
      period: "Aug 2026",
      totalSpend: 0,
      expenseCount: 0,
      recordedDayCount: 0,
      accountCount: 0,
      topCategory: "None",
      topCategoryAmount: 0,
      averagePerDay: 0,
      budgetUsed: 0,
      budgetRemaining: 0,
      budgetLimit: 0,
      budgetedSpend: 0,
      unbudgetedSpend: 0,
    });
    expect(dashboard.categorySpending).toEqual([]);
    expect(dashboard.recentExpenses).toEqual([]);
    expect(dashboard.spendingPoints).toHaveLength(31);
    expect(dashboard.spendingPoints.every((point) => point.amount === 0)).toBe(
      true,
    );
  });
});
