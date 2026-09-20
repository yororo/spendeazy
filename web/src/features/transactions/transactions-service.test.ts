import { describe, expect, it, vi } from "vitest";

import type { ApiRequestOptionsWithoutBody } from "@/shared/api";
import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  createTransaction as createTransactionRequest,
  deleteTransaction,
  listTransactions,
  updateTransaction,
  type TransactionsApiClient,
} from "./transactions-service";

const period = "2026-08" as ReportingPeriod;
const categoriesPath = "/categories";
const summaryPath = "/category-summaries?period=monthly&year=2026&month=08";
const firstTransactionsPath =
  "/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=20";
const secondTransactionsPath =
  "/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=20&cursor=cursor-2";

function createSummary() {
  return {
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
  };
}

function createCategories() {
  return [
    {
      id: "42",
      name: "Housing",
      description: null,
      color: "teal",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "43",
      name: "Groceries",
      description: null,
      color: "forest",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

function createTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "10",
    categoryId: "42",
    purchaseDate: "2026-08-31",
    description: "Monthly rent",
    amount: "70.00",
    source: "imported",
    statementImportId: "100",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function createApiClient(responses: ReadonlyMap<string, unknown>) {
  const get = vi.fn(
    async (path: string, options?: ApiRequestOptionsWithoutBody) => {
      void options;
      if (!responses.has(path)) {
        throw new Error(`Unexpected GET ${path}`);
      }

      return responses.get(path);
    },
  );

  return {
    apiClient: { get } as unknown as TransactionsApiClient,
    get,
  };
}

describe("listTransactions", () => {
  it("requests the selected month and projects summary, Category, and Account data", async () => {
    const responses = new Map<string, unknown>([
      [categoriesPath, createCategories()],
      [summaryPath, createSummary()],
      [
        firstTransactionsPath,
        {
          items: [
            createTransaction(),
            createTransaction({
              id: "9",
              categoryId: null,
              purchaseDate: "2026-08-30",
              description: "Cash lunch",
              amount: "10.00",
              source: "manual",
              statementImportId: null,
            }),
          ],
          nextCursor: "cursor-2",
        },
      ],
      [
        "/statement-imports/100",
        {
          id: "100",
          fileName: "august.pdf",
          statementDate: "2026-08-31",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    ]);
    const { apiClient, get } = createApiClient(responses);
    const controller = new AbortController();

    const page = await listTransactions(
      apiClient,
      { period, pageSize: 20 },
      controller.signal,
    );

    expect(page).toEqual({
      items: [
        {
          id: "10",
          categoryId: "42",
          purchaseDate: "2026-08-31",
          date: "Aug 31",
          description: "Monthly rent",
          category: "housing",
          categoryLabel: "Housing",
          categoryColor: "teal",
          account: "BDO \u00b7 AMEX",
          amount: -70,
          source: "imported",
          statementImportId: "100",
          updatedAt: "2026-08-31T00:00:00.000Z",
        },
        {
          id: "9",
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
          updatedAt: "2026-08-31T00:00:00.000Z",
        },
      ],
      nextCursor: "cursor-2",
      summary: {
        period: "Aug 2026",
        transactionCount: 4,
        totalExpense: 140,
      },
      categories: createCategories(),
    });
    expect(get).toHaveBeenCalledWith(categoriesPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(summaryPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith(firstTransactionsPath, {
      signal: controller.signal,
    });
    expect(get).toHaveBeenCalledWith("/statement-imports/100", {
      signal: controller.signal,
    });
  });

  it("uses Space-scoped paths when listing a selected Space", async () => {
    const spaceId = "space/7";
    const scopedCategoriesPath = "/spaces/space%2F7/categories";
    const scopedSummaryPath =
      "/spaces/space%2F7/category-summaries?period=monthly&year=2026&month=08";
    const scopedTransactionsPath =
      "/spaces/space%2F7/transactions?fromDate=2026-08-01&toDate=2026-08-31&pageSize=20";
    const responses = new Map<string, unknown>([
      [scopedCategoriesPath, createCategories()],
      [scopedSummaryPath, createSummary()],
      [
        scopedTransactionsPath,
        { items: [createTransaction({ source: "manual" })], nextCursor: null },
      ],
    ]);
    const { apiClient, get } = createApiClient(responses);

    await listTransactions(apiClient, { period, pageSize: 20, spaceId });

    expect(get).toHaveBeenCalledWith(scopedCategoriesPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedSummaryPath, {
      signal: undefined,
    });
    expect(get).toHaveBeenCalledWith(scopedTransactionsPath, {
      signal: undefined,
    });
  });

  it("composes a subsequent cursor request without using numbered pages", async () => {
    const responses = new Map<string, unknown>([
      [categoriesPath, createCategories()],
      [summaryPath, createSummary()],
      [
        secondTransactionsPath,
        {
          items: [
            createTransaction({
              id: "8",
              categoryId: "43",
              purchaseDate: "2026-08-02",
              description: "Weekly groceries",
              amount: "30.00",
              statementImportId: "101",
            }),
          ],
          nextCursor: null,
        },
      ],
      [
        "/statement-imports/101",
        {
          id: "101",
          fileName: "july.pdf",
          statementDate: "2026-07-31",
          bank: "BDO",
          cardType: null,
          importedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    ]);
    const { apiClient, get } = createApiClient(responses);

    const page = await listTransactions(apiClient, {
      period,
      pageSize: 20,
      cursor: "cursor-2",
    });

    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        id: "8",
        categoryId: "43",
        purchaseDate: "2026-08-02",
        date: "Aug 02",
        description: "Weekly groceries",
        category: "groceries",
        categoryLabel: "Groceries",
        categoryColor: "forest",
        account: "BDO",
        amount: -30,
        source: "imported",
        statementImportId: "101",
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
    ]);
    expect(get).toHaveBeenCalledWith(secondTransactionsPath, {
      signal: undefined,
    });
  });

  it("fails explicitly when an imported Transaction has no Statement Import relationship", async () => {
    const invalidTransaction = createTransaction({
      id: "missing-import",
      statementImportId: null,
    });
    const responses = new Map<string, unknown>([
      [categoriesPath, createCategories()],
      [summaryPath, createSummary()],
      [
        firstTransactionsPath,
        { items: [invalidTransaction], nextCursor: null },
      ],
    ]);
    const { apiClient, get } = createApiClient(responses);

    await expect(
      listTransactions(apiClient, { period, pageSize: 20 }),
    ).rejects.toMatchObject({
      kind: "data",
      message:
        "Imported Transaction missing-import is missing its Statement Import ID.",
    });
    expect(get.mock.calls).not.toContainEqual([
      "/statement-imports/undefined",
      { signal: undefined },
    ]);
  });

  it("fails explicitly when an imported Transaction references an unavailable Statement Import", async () => {
    const invalidImportTransaction = createTransaction({
      id: "broken-import",
      statementImportId: "404",
    });
    const responses = new Map<string, unknown>([
      [categoriesPath, createCategories()],
      [summaryPath, createSummary()],
      [
        firstTransactionsPath,
        { items: [invalidImportTransaction], nextCursor: null },
      ],
    ]);
    const { apiClient } = createApiClient(responses);

    await expect(
      listTransactions(apiClient, { period, pageSize: 20 }),
    ).rejects.toMatchObject({
      kind: "data",
      message: expect.stringContaining("Unable to load Statement Import 404"),
    });
  });
});

describe("Transaction mutations", () => {
  it("uses Space-scoped CRUD paths and carries optimistic concurrency values", async () => {
    const response = createTransaction({
      source: "manual",
      statementImportId: null,
      addedByUserId: "7",
    });
    const post = vi.fn(async () => response);
    const patch = vi.fn(async () => response);
    const deleteRequest = vi.fn(async () => undefined);
    const apiClient = {
      get: vi.fn(),
      post,
      patch,
      delete: deleteRequest,
    } as unknown as TransactionsApiClient;

    await expect(
      createTransactionRequest(apiClient, {
        spaceId: "space/7",
        purchaseDate: "2026-08-31",
        description: "  Coffee  ",
        amount: "4.50",
        categoryId: null,
      }),
    ).resolves.toMatchObject({ id: "10", addedByUserId: "7" });
    expect(post).toHaveBeenCalledWith(
      "/spaces/space%2F7/transactions",
      {
        purchaseDate: "2026-08-31",
        description: "  Coffee  ",
        amount: "4.50",
        categoryId: null,
      },
      { expectedStatuses: [201] },
    );

    await updateTransaction(apiClient, {
      spaceId: "space/7",
      transactionId: "10",
      categoryId: "42",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
    expect(patch).toHaveBeenCalledWith(
      "/spaces/space%2F7/transactions/10",
      {
        categoryId: "42",
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
      { expectedStatuses: [200] },
    );

    await deleteTransaction(
      apiClient,
      "10",
      "space/7",
      "2026-08-31T00:00:00.000Z",
    );
    expect(deleteRequest).toHaveBeenCalledWith(
      "/spaces/space%2F7/transactions/10",
      {
        headers: { "If-Match": "2026-08-31T00:00:00.000Z" },
        expectedStatuses: [204],
      },
    );
  });
});
