import { describe, expect, it, vi } from "vitest";

import type { ApiRequestOptionsWithoutBody } from "@/shared/api";
import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  buildTransactionActivityPath,
  buildDeletedTransactionCollectionPath,
  createTransaction as createTransactionRequest,
  deleteTransaction,
  getTransactionActivity,
  listDeletedTransactions,
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
const deletedTransactionsPath = "/transactions/history?pageSize=20";

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
  it("browses a committed statement across months and summarizes every filtered page", async () => {
    const rows = [createTransaction({ purchaseDate: "2026-07-31" }), createTransaction({ id: "11", purchaseDate: "2026-08-01", amount: "30.25" })];
    const { apiClient } = createApiClient(new Map<string, unknown>([
      [categoriesPath, createCategories()],
      ["/transactions?statementImportId=100&pageSize=20", { items: rows, nextCursor: null }],
      ["/transactions?statementImportId=100&pageSize=100", { items: [rows[0]], nextCursor: "next" }],
      ["/transactions?statementImportId=100&pageSize=100&cursor=next", { items: [rows[1]], nextCursor: null }],
      ["/statement-imports/100", { id: "100", fileName: "fictional.pdf", bank: "BDO", cardType: "AMEX" }],
    ]));
    const page = await listTransactions(apiClient, { period, pageSize: 20, statementImportId: "100" });
    expect(page.items.map((item) => item.purchaseDate)).toEqual(["2026-07-31", "2026-08-01"]);
    expect(page.summary).toEqual({ period: "Statement Import #100", transactionCount: 2, totalExpense: 100.25, activityFromDate: "2026-07-31", activityToDate: "2026-08-01" });
  });
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
      totalCount: 4,
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
        { items: [createTransaction()], nextCursor: null },
      ],
      [
        "/spaces/space%2F7/statement-imports/100",
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
    expect(get).toHaveBeenCalledWith(
      "/spaces/space%2F7/statement-imports/100",
      { signal: undefined },
    );
  });

  it("sends description, Category, date, and Account filters to the full-period API query", async () => {
    const filteredPath = "/transactions?fromDate=2026-08-10&toDate=2026-08-20&description=Coffee&categoryId=42&accountBank=BDO&accountCardType=AMEX&pageSize=20";
    const { apiClient, get } = createApiClient(new Map<string, unknown>([
      [categoriesPath, createCategories()],
      [summaryPath, createSummary()],
      [filteredPath, { items: [], nextCursor: null, totalCount: "0" }],
      [filteredPath.replace("pageSize=20", "pageSize=100"), { items: [], nextCursor: null, totalCount: "0" }],
    ]));
    const page = await listTransactions(apiClient, {
      period, pageSize: 20, description: "Coffee", fromDate: "2026-08-10",
      toDate: "2026-08-20", categoryId: "42", accountBank: "BDO", accountCardType: "AMEX",
    });
    expect(page.totalCount).toBe(0);
    expect(get).toHaveBeenCalledWith(filteredPath, { signal: undefined });
  });

  it("sums every filtered page with combined filters and ignores the UI cursor", async () => {
    const base = "/spaces/7/transactions?fromDate=2026-08-10&toDate=2026-08-20&description=Coffee&categoryState=uncategorized&source=manual";
    const item = createTransaction({ source: "manual", statementImportId: null, categoryId: null, amount: "0.10" });
    const { apiClient, get } = createApiClient(new Map<string, unknown>([
      ["/spaces/7/categories", createCategories()],
      [`${base}&pageSize=20&cursor=ui-page`, { items: [item], nextCursor: null, totalCount: "3" }],
      [`${base}&pageSize=100`, { items: [item, { ...item, id: "11", amount: "12.34" }], nextCursor: "summary-page", totalCount: "3" }],
      [`${base}&pageSize=100&cursor=summary-page`, { items: [{ ...item, id: "12", amount: "0.20" }], nextCursor: null, totalCount: "3" }],
    ]));
    const page = await listTransactions(apiClient, { period, spaceId: "7", pageSize: 20, cursor: "ui-page", description: "Coffee", categoryState: "uncategorized", source: "manual", fromDate: "2026-08-10", toDate: "2026-08-20" });
    expect(page.summary).toEqual({ period: "Aug 2026", transactionCount: 3, totalExpense: 12.64 });
    expect(page.totalCount).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("category-summaries"), expect.anything());
  });

  it("rejects incomplete filtered totals and retries the complete traversal", async () => {
    const base = "/transactions?fromDate=2026-08-01&toDate=2026-08-31&description=Coffee&pageSize=";
    const item = createTransaction({ source: "manual", statementImportId: null, amount: "1.25" });
    const responses = new Map<string, unknown>([
      [categoriesPath, createCategories()],
      [`${base}20`, { items: [item], nextCursor: null }],
      [`${base}100`, { items: [item], nextCursor: "next" }],
    ]);
    const { apiClient } = createApiClient(responses);
    await expect(listTransactions(apiClient, { period, pageSize: 20, description: "Coffee" })).rejects.toThrow("Unexpected GET");
    responses.set(`${base}100&cursor=next`, { items: [], nextCursor: null });
    const page = await listTransactions(apiClient, { period, pageSize: 20, description: "Coffee" });
    expect(page.summary).toEqual({ period: "Aug 2026", transactionCount: 1, totalExpense: 1.25 });
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

describe("deleted Transaction history", () => {
  it("loads retained Transactions through the history collection", async () => {
    const responses = new Map<string, unknown>([
      [categoriesPath, createCategories()],
      [
        deletedTransactionsPath,
        {
          items: [
            createTransaction({
              id: "deleted-1",
              source: "manual",
              statementImportId: null,
              deletedAt: "2026-09-20T00:02:00.000Z",
            }),
          ],
          nextCursor: null,
        },
      ],
    ]);
    const { apiClient, get } = createApiClient(responses);

    await expect(
      listDeletedTransactions(apiClient, { pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "deleted-1", deletedAt: "2026-09-20T00:02:00.000Z" })],
      nextCursor: null,
    });

    expect(buildDeletedTransactionCollectionPath()).toBe(
      "/transactions/history",
    );
    expect(get).toHaveBeenCalledWith(deletedTransactionsPath, {
      signal: undefined,
    });
  });
});

describe("Transaction activity", () => {
  it("loads activity through the selected Space boundary", async () => {
    const get = vi.fn(async () => [
      {
        id: "activity-1",
        transactionId: "10",
        type: "created",
        actorUserId: "7",
        occurredAt: "2026-08-31T00:00:00.000Z",
      },
      {
        id: "activity-2",
        transactionId: "10",
        type: "edited",
        actorUserId: "8",
        occurredAt: "2026-09-01T00:00:00.000Z",
        before: {
          categoryId: null,
          purchaseDate: "2026-08-31",
          description: "Coffee",
          amount: "4.50",
        },
        after: {
          categoryId: "42",
          purchaseDate: "2026-08-31",
          description: "Team coffee",
          amount: "4.50",
        },
      },
      {
        id: "activity-3",
        transactionId: "10",
        type: "deleted",
        actorUserId: "9",
        occurredAt: "2026-09-02T00:00:00.000Z",
      },
    ]);
    const apiClient = { get } as unknown as TransactionsApiClient;
    const controller = new AbortController();

    await expect(
      getTransactionActivity(apiClient, "10", "space/7", controller.signal),
    ).resolves.toEqual([
      {
        id: "activity-1",
        transactionId: "10",
        type: "created",
        actorUserId: "7",
        occurredAt: "2026-08-31T00:00:00.000Z",
      },
      {
        id: "activity-2",
        transactionId: "10",
        type: "edited",
        actorUserId: "8",
        occurredAt: "2026-09-01T00:00:00.000Z",
        before: {
          categoryId: null,
          purchaseDate: "2026-08-31",
          description: "Coffee",
          amount: "4.50",
        },
        after: {
          categoryId: "42",
          purchaseDate: "2026-08-31",
          description: "Team coffee",
          amount: "4.50",
        },
      },
      {
        id: "activity-3",
        transactionId: "10",
        type: "deleted",
        actorUserId: "9",
        occurredAt: "2026-09-02T00:00:00.000Z",
      },
    ]);
    expect(buildTransactionActivityPath("10", "space/7")).toBe(
      "/spaces/space%2F7/transactions/10/activity",
    );
    expect(get).toHaveBeenCalledWith(
      "/spaces/space%2F7/transactions/10/activity",
      { signal: controller.signal },
    );
  });

  it("rejects malformed activity responses", async () => {
    const apiClient = {
      get: vi.fn(async () => [{ id: "activity-1", type: "created" }]),
    } as unknown as TransactionsApiClient;

    await expect(getTransactionActivity(apiClient, "10")).rejects.toMatchObject(
      {
        kind: "data",
        message: "The API returned invalid Transaction activity.",
      },
    );
  });

  it("rejects edited activity without complete snapshots", async () => {
    const apiClient = {
      get: vi.fn(async () => [
        {
          id: "activity-1",
          transactionId: "10",
          type: "edited",
          actorUserId: "7",
          occurredAt: "2026-08-31T00:00:00.000Z",
          before: {
            categoryId: null,
            purchaseDate: "2026-08-31",
            description: "Coffee",
            amount: "4.50",
          },
        },
      ]),
    } as unknown as TransactionsApiClient;

    await expect(getTransactionActivity(apiClient, "10")).rejects.toMatchObject(
      {
        kind: "data",
        message: "The API returned invalid Transaction activity.",
      },
    );
  });
});
