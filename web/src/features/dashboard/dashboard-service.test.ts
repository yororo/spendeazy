import { describe, expect, it, vi } from "vitest";

import type { ApiRequestOptionsWithoutBody } from "@/shared/api";
import type { ReportingPeriod } from "@/shared/reporting-period";

import { getDashboard, type DashboardApiClient } from "./dashboard-service";

const period = "2026-08" as ReportingPeriod;
const summaryPath = "/category-summaries?period=monthly&year=2026&month=08";
const fullTransactionsPath =
  "/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=100";
const secondTransactionsPath =
  "/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=100&cursor=page-2";
const recentTransactionsPath =
  "/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=5";
const scopedCategoryPath = "/spaces/7/categories";
const scopedSummaryPath =
  "/spaces/7/category-summaries?period=monthly&year=2026&month=08";
const scopedFullTransactionsPath =
  "/spaces/7/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=100";
const scopedRecentTransactionsPath =
  "/spaces/7/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=5";
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
  it("loads Dashboard aggregates and recent Transactions from the selected Space", async () => {
    const responses = new Map<string, unknown>([
      [scopedCategoryPath, createCategoryCatalog()],
      [scopedSummaryPath, createEmptySummary()],
      [
        scopedFullTransactionsPath,
        {
          items: [
            {
              id: "transaction-1",
              categoryId: "42",
              purchaseDate: "2026-08-01",
              description: "Scoped imported transaction",
              amount: "10.00",
              source: "imported",
              statementImportId: "statement-1",
            },
          ],
          nextCursor: null,
        },
      ],
      [scopedRecentTransactionsPath, { items: [], nextCursor: null }],
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
    expect(get).toHaveBeenCalledWith(scopedFullTransactionsPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedRecentTransactionsPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedStatementImportPath, {
      signal: undefined,
    });
  });

  it("projects persisted summary data, traverses transaction pages, and joins recent transactions", async () => {
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
              transactionCount: "2",
              budgetAmount: "150.00",
              remainingAmount: "50.00",
            },
            {
              categoryId: "43",
              name: "Groceries",
              isActive: true,
              totalAmount: "30.00",
              transactionCount: "1",
              budgetAmount: null,
              remainingAmount: null,
            },
          ],
          uncategorizedTotal: "10.00",
          uncategorizedCount: "1",
        },
      ],
      [
        fullTransactionsPath,
        {
          items: [
            {
              id: "transaction-10",
              categoryId: "42",
              purchaseDate: "2026-08-31",
              description: "Monthly rent",
              amount: "70.00",
              source: "imported",
              statementImportId: "statement-1",
            },
            {
              id: "transaction-9",
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
        secondTransactionsPath,
        {
          items: [
            {
              id: "transaction-8",
              categoryId: "43",
              purchaseDate: "2026-08-02",
              description: "Weekly groceries",
              amount: "30.00",
              source: "imported",
              statementImportId: "statement-2",
            },
            {
              id: "transaction-7",
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
        recentTransactionsPath,
        {
          items: [
            {
              id: "transaction-10",
              categoryId: "42",
              purchaseDate: "2026-08-31",
              description: "Monthly rent",
              amount: "70.00",
              source: "imported",
              statementImportId: "statement-1",
            },
            {
              id: "transaction-9",
              categoryId: null,
              purchaseDate: "2026-08-30",
              description: "Cash lunch",
              amount: "10.00",
              source: "manual",
              statementImportId: null,
            },
            {
              id: "transaction-8",
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
      transactionCount: 4,
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
    expect(dashboard.spendingPoints[1]).toEqual({ label: "2", amount: 60 });
    expect(dashboard.spendingPoints[29]).toEqual({ label: "30", amount: 10 });
    expect(dashboard.spendingPoints[30]).toEqual({ label: "31", amount: 70 });
    expect(dashboard.recentTransactions).toEqual([
      {
        id: "transaction-10",
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
        id: "transaction-9",
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
        id: "transaction-8",
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
    expect(get).toHaveBeenCalledWith(fullTransactionsPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(secondTransactionsPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(recentTransactionsPath, {
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

  it("fails explicitly when an imported Transaction has no Statement Import ID", async () => {
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
        fullTransactionsPath,
        {
          items: [
            {
              id: "transaction-without-import",
              categoryId: null,
              purchaseDate: "2026-08-01",
              description: "Invalid imported Transaction",
              amount: "10.00",
              source: "imported",
              statementImportId: null,
            },
          ],
          nextCursor: null,
        },
      ],
      [recentTransactionsPath, { items: [], nextCursor: null }],
    ]);
    const { apiClient, get } = createApiClient(responses);

    await expect(getDashboard(apiClient, period)).rejects.toMatchObject({
      kind: "data",
      message:
        "Imported Transaction transaction-without-import is missing its Statement Import ID.",
    });
    expect(get.mock.calls).not.toContainEqual([
      "/statement-imports/undefined",
      { signal: undefined },
    ]);
  });

  it("fails explicitly when a referenced Statement Import cannot be loaded", async () => {
    const importedTransaction = {
      id: "transaction-404",
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
        fullTransactionsPath,
        { items: [importedTransaction], nextCursor: null },
      ],
      [
        recentTransactionsPath,
        { items: [importedTransaction], nextCursor: null },
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
      [fullTransactionsPath, { items: [], nextCursor: null }],
      [recentTransactionsPath, { items: [], nextCursor: null }],
    ]);
    const { apiClient } = createApiClient(responses);

    const dashboard = await getDashboard(apiClient, period);

    expect(dashboard.summary).toEqual({
      period: "Aug 2026",
      totalSpend: 0,
      transactionCount: 0,
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
    expect(dashboard.recentTransactions).toEqual([]);
    expect(dashboard.spendingPoints).toHaveLength(31);
    expect(dashboard.spendingPoints.every((point) => point.amount === 0)).toBe(
      true,
    );
  });
});
