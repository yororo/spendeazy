import { describe, expect, it, vi } from "vitest";

import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  getInsights,
  getYearlyInsights,
  type InsightsApiClient,
} from "./insights-service";

const leapMonth = "2024-02" as ReportingPeriod;
const categoryPath = "/spaces/7/categories";
const summaryPath =
  "/spaces/7/category-summaries?period=monthly&year=2024&month=02";
const transactionPath =
  "/spaces/7/transactions?fromDate=2024-02-01&toDate=2024-02-29&pageSize=100";
const nextTransactionPath = `${transactionPath}&cursor=next-page`;
const yearlySummaryPath =
  "/spaces/7/category-summaries?period=monthly&year=2026&month=01";
const yearlyTransactionPath =
  "/spaces/7/transactions?fromDate=2025-02-01&toDate=2026-01-31&pageSize=100";

function categoryCatalog() {
  return [
    {
      id: "42",
      name: "Groceries",
      description: null,
      color: "teal",
      isActive: true,
      updatedAt: "2024-02-01T00:00:00.000Z",
    },
    {
      id: "43",
      name: "Archived Category",
      description: null,
      color: "plum",
      isActive: false,
      updatedAt: "2024-02-01T00:00:00.000Z",
    },
    {
      id: "44",
      name: "Transit",
      description: null,
      color: "forest",
      isActive: true,
      updatedAt: "2024-02-01T00:00:00.000Z",
    },
  ];
}

function monthlySummary() {
  return {
    period: "monthly",
    year: "2024",
    month: "02",
    categories: [
      {
        categoryId: "42",
        name: "Groceries",
        isActive: true,
        totalAmount: "0.31",
        transactionCount: "3",
        budgetAmount: "100.00",
        remainingAmount: "99.69",
      },
      {
        categoryId: "43",
        name: "Archived Category",
        isActive: false,
        totalAmount: "1.00",
        transactionCount: "1",
        budgetAmount: null,
        remainingAmount: null,
      },
      {
        categoryId: "44",
        name: "Transit",
        isActive: true,
        totalAmount: "0.40",
        transactionCount: "1",
        budgetAmount: "20.00",
        remainingAmount: "19.60",
      },
    ],
    uncategorizedTotal: "0.30",
    uncategorizedCount: "1",
  };
}

function createApiClient(responses: ReadonlyMap<string, unknown>) {
  const get = vi.fn(async (path: string) => {
    if (!responses.has(path)) throw new Error(`Unexpected GET ${path}`);
    return responses.get(path);
  });

  return { apiClient: { get } as unknown as InsightsApiClient, get };
}

describe("getInsights", () => {
  it("aggregates exact daily spending across pages in the selected Space", async () => {
    const { apiClient, get } = createApiClient(
      new Map<string, unknown>([
        [categoryPath, categoryCatalog()],
        [summaryPath, monthlySummary()],
        [
          transactionPath,
          {
            items: [
              {
                id: "grocery-1",
                categoryId: "42",
                purchaseDate: "2024-02-29",
                description: "Groceries",
                amount: "0.10",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "grocery-2",
                categoryId: "42",
                purchaseDate: "2024-02-29",
                description: "More groceries",
                amount: "0.20",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "uncategorized-1",
                categoryId: null,
                purchaseDate: "2024-02-29",
                description: "Uncategorized expense",
                amount: "0.30",
                source: "manual",
                statementImportId: null,
              },
            ],
            nextCursor: "next-page",
          },
        ],
        [
          nextTransactionPath,
          {
            items: [
              {
                id: "archived-1",
                categoryId: "43",
                purchaseDate: "2024-02-28",
                description: "Historical category expense",
                amount: "1.00",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "transit-1",
                categoryId: "44",
                purchaseDate: "2024-02-28",
                description: "Transit fare",
                amount: "0.40",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "grocery-3",
                categoryId: "42",
                purchaseDate: "2024-02-10",
                description: "Fruit",
                amount: "0.01",
                source: "manual",
                statementImportId: null,
              },
            ],
            nextCursor: null,
          },
        ],
      ]),
    );

    const report = await getInsights(apiClient, leapMonth, undefined, "7");

    expect(get).toHaveBeenCalledWith(categoryPath, { signal: undefined });
    expect(get).toHaveBeenCalledWith(summaryPath, { signal: undefined });
    expect(get).toHaveBeenCalledWith(transactionPath, { signal: undefined });
    expect(get).toHaveBeenCalledWith(nextTransactionPath, {
      signal: undefined,
    });
    expect(report.days).toHaveLength(29);
    expect(report.days[0]).toMatchObject({ day: 1, spendingCents: 0 });
    expect(report.days[9]).toMatchObject({
      day: 10,
      spendingCents: 1,
      budgetedSpendingCents: 1,
    });
    expect(report.days[27]).toMatchObject({
      day: 28,
      spendingCents: 140,
      budgetedSpendingCents: 40,
    });
    expect(report.days[28]).toMatchObject({
      day: 29,
      spendingCents: 60,
      budgetedSpendingCents: 30,
    });
    expect(report.totalSpendingCents).toBe(201);
    expect(report.budgetedSpendingCents).toBe(71);
    expect(report.monthlyBudgetCents).toBe(12_000);
    expect(report.dailyBudgetPaceCents).toBe(12_000 / 29);
    expect(report.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "43",
          label: "Archived Category",
          color: "plum",
          spendingCents: 100,
        }),
        expect.objectContaining({
          id: null,
          label: "Uncategorized",
          color: null,
          spendingCents: 30,
        }),
      ]),
    );
  });

  it("returns every zero-spend day and a zero pace for a month without Budgets", async () => {
    const { apiClient } = createApiClient(
      new Map<string, unknown>([
        ["/categories", []],
        [
          "/category-summaries?period=monthly&year=2026&month=08",
          {
            period: "monthly",
            year: "2026",
            month: "08",
            categories: [],
            uncategorizedTotal: "0.00",
            uncategorizedCount: "0",
          },
        ],
        [
          "/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=100",
          { items: [], nextCursor: null },
        ],
      ]),
    );

    const report = await getInsights(
      apiClient,
      "2026-08" as ReportingPeriod,
    );

    expect(report.days).toHaveLength(31);
    expect(report.days.every((day) => day.spendingCents === 0)).toBe(true);
    expect(report.totalSpendingCents).toBe(0);
    expect(report.budgetedSpendingCents).toBe(0);
    expect(report.monthlyBudgetCents).toBe(0);
    expect(report.dailyBudgetPaceCents).toBe(0);
  });

  it("builds a rolling 12-month report with all spending and strict current-Budget breaches", async () => {
    const { apiClient, get } = createApiClient(
      new Map<string, unknown>([
        [categoryPath, categoryCatalog()],
        [
          yearlySummaryPath,
          {
            period: "monthly",
            year: "2026",
            month: "01",
            categories: [
              {
                categoryId: "42",
                name: "Groceries",
                isActive: true,
                totalAmount: "9.99",
                transactionCount: "1",
                budgetAmount: "10.00",
                remainingAmount: "0.01",
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
            uncategorizedTotal: "0.00",
            uncategorizedCount: "0",
          },
        ],
        [
          yearlyTransactionPath,
          {
            items: [
              {
                id: "at-budget",
                categoryId: "42",
                purchaseDate: "2025-02-10",
                description: "At the current Budget",
                amount: "10.00",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "over-budget",
                categoryId: "42",
                purchaseDate: "2025-03-10",
                description: "One cent over",
                amount: "10.01",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "unbudgeted-transit",
                categoryId: "44",
                purchaseDate: "2025-03-11",
                description: "Unbudgeted transit",
                amount: "5.00",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "uncategorized",
                categoryId: null,
                purchaseDate: "2025-03-12",
                description: "Uncategorized purchase",
                amount: "0.25",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "unbudgeted-spending-above-budget",
                categoryId: "44",
                purchaseDate: "2025-04-10",
                description: "Unbudgeted spending above the reference",
                amount: "11.00",
                source: "manual",
                statementImportId: null,
              },
              {
                id: "budgeted-spending-below-budget",
                categoryId: "42",
                purchaseDate: "2025-04-11",
                description: "Budgeted spending below the reference",
                amount: "0.50",
                source: "manual",
                statementImportId: null,
              },
            ],
            nextCursor: "last-page",
          },
        ],
        [
          `${yearlyTransactionPath}&cursor=last-page`,
          {
            items: [
              {
                id: "within-budget",
                categoryId: "42",
                purchaseDate: "2026-01-10",
                description: "Within the current Budget",
                amount: "9.99",
                source: "manual",
                statementImportId: null,
              },
            ],
            nextCursor: null,
          },
        ],
      ]),
    );

    const report = await getYearlyInsights(
      apiClient,
      "2026-01" as ReportingPeriod,
      undefined,
      "7",
    );

    expect(get).toHaveBeenCalledWith(yearlySummaryPath, { signal: undefined });
    expect(get).toHaveBeenCalledWith(yearlyTransactionPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(
      `${yearlyTransactionPath}&cursor=last-page`,
      { signal: undefined },
    );
    expect(report.monthlyBudgetCents).toBe(1_000);
    expect(report.totalSpendingCents).toBe(4_675);
    expect(report.budgetedSpendingCents).toBe(3_050);
    expect(report.months.map(({ period }) => period)).toEqual([
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    expect(report.months[0]).toMatchObject({
      totalSpendingCents: 1_000,
      budgetedSpendingCents: 1_000,
      isOverBudget: false,
    });
    expect(report.months[1]).toMatchObject({
      totalSpendingCents: 1_526,
      budgetedSpendingCents: 1_001,
      isOverBudget: true,
    });
    expect(report.months[1].categories).toEqual(
      expect.arrayContaining([
        { categoryId: "44", amountCents: 500 },
        { categoryId: null, amountCents: 25 },
      ]),
    );
    expect(report.months[2]).toMatchObject({
      totalSpendingCents: 1_150,
      budgetedSpendingCents: 50,
      isOverBudget: false,
    });
    expect(report.months[3]).toMatchObject({
      totalSpendingCents: 0,
      budgetedSpendingCents: 0,
      isOverBudget: false,
    });
    expect(report.months[11]).toMatchObject({
      totalSpendingCents: 999,
      budgetedSpendingCents: 999,
      isOverBudget: false,
    });
  });
});
