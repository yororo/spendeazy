import { describe, expect, it, vi } from "vitest";

import type {
  StatementSummary,
  Transaction,
} from "./statement-parser/transformer";
import {
  buildCommitPayload,
  categorizeTransactions,
  commitStatementImport,
  getCategoryOptions,
  getCategoryRules,
  getIncludedTransactions,
  getRecentImports,
  hashStatementFile,
  rememberCategoryRule,
  type CategoryRule,
  type StatementImportApiClient,
} from "./statement-import-service";
import { normalizeDescription } from "./statement-import-utils";

import { ApiError } from "@/shared/api";

import type { CategorizedStatement } from "./statement-categorizer";
import { applyGcashRecipientExclusion } from "./gcash-recipient";
import { getProbableDuplicateConflict } from "./statement-import-errors";
import {
  applyManualTransactionEdit,
  isIncludedStatementTransaction,
} from "./statement-import-utils";

function createTransaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    transactionDate: new Date("2026-08-29T00:00:00.000Z"),
    postingDate: new Date("2026-08-30T00:00:00.000Z"),
    description: "Green   Market",
    amount: 25.5,
    ...overrides,
  };
}

function createRule(overrides: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: "1",
    categoryId: "42",
    pattern: "GREEN MARKET",
    matchType: "exact",
    ...overrides,
  };
}

function createSummary(): StatementSummary {
  return {
    statementDate: new Date("2026-08-31T00:00:00.000Z"),
    provider: "BDO",
    accountType: "AMEX",
    totalTransactions: 3,
    totalAmountDue: 100,
    totalExtractedAmount: 90,
  };
}

function createCategorizedStatement(): CategorizedStatement {
  return {
    summary: createSummary(),
    transactions: [
      {
        ...createTransaction({ description: "Green   Market", amount: -25.5 }),
        id: "transaction-1",
        categoryId: "42",
        assignment: "rule",
        matchedCategoryIds: [],
        isExcluded: false,
      },
      {
        ...createTransaction({ description: "Refund", amount: 10 }),
        id: "transaction-2",
        categoryId: null,
        assignment: "unmapped",
        matchedCategoryIds: [],
        isExcluded: true,
      },
      {
        ...createTransaction({ description: "Excluded purchase", amount: 5 }),
        id: "transaction-3",
        categoryId: "43",
        assignment: "manual",
        matchedCategoryIds: [],
        isExcluded: true,
      },
    ],
  };
}

describe("Statement Import categorization", () => {
  it("normalizes descriptions and applies literal Contains Rules after Exact Rules", () => {
    expect(normalizeDescription("  Green   Market ")).toBe("GREEN MARKET");

    expect(
      categorizeTransactions(
        [
          createTransaction(),
          createTransaction({ description: "Green Market Cafe" }),
          createTransaction({ description: "Parent rent" }),
        ],
        [
          createRule(),
          createRule({
            id: "2",
            categoryId: "43",
            pattern: "Green",
            matchType: "contains",
          }),
          createRule({
            id: "3",
            categoryId: "43",
            pattern: "Rent",
            matchType: "contains",
          }),
        ],
        new Set(["42", "43"]),
      ),
    ).toEqual([
      { categoryId: "42", assignment: "rule" },
      { categoryId: "43", assignment: "rule" },
      { categoryId: "43", assignment: "rule" },
    ]);
  });

  it("allows same-Category Contains overlap", () => {
    expect(
      categorizeTransactions(
        [
          createTransaction({ description: "ACME, INC." }),
          createTransaction({ description: "ACME INC" }),
        ],
        [
          createRule({ pattern: "ACME, INC.", matchType: "contains" }),
          createRule({ id: "2", pattern: "ACME", matchType: "contains" }),
        ],
        new Set(["42"]),
      ),
    ).toEqual([
      { categoryId: "42", assignment: "rule" },
      { categoryId: "42", assignment: "rule" },
    ]);
  });

  it("keeps punctuation significant for Contains matching", () => {
    const rules = [
      createRule({ pattern: "ACME, INC.", matchType: "contains" }),
    ];

    expect(
      categorizeTransactions(
        [createTransaction({ description: "ACME, INC." })],
        rules,
        new Set(["42"]),
      ),
    ).toEqual([{ categoryId: "42", assignment: "rule" }]);
    expect(
      categorizeTransactions(
        [createTransaction({ description: "ACME INC" })],
        rules,
        new Set(["42"]),
      ),
    ).toEqual([{ categoryId: null, assignment: "unmapped" }]);
  });

  it("does not assign a Rule whose Category is inactive", () => {
    expect(
      categorizeTransactions(
        [createTransaction()],
        [createRule({ categoryId: "43" })],
        new Set(["42"]),
      ),
    ).toEqual([{ categoryId: null, assignment: "unmapped" }]);
  });

  it("reports distinct matching Categories as an unresolved ambiguity", () => {
    expect(
      categorizeTransactions(
        [createTransaction()],
        [
          createRule({ categoryId: "42" }),
          createRule({ id: "2", categoryId: "43", pattern: " green market " }),
        ],
        new Set(["42", "43"]),
      ),
    ).toEqual([
      {
        categoryId: null,
        assignment: "ambiguous",
        matchedCategoryIds: ["42", "43"],
      },
    ]);
  });

  it("loads only active Categories and persisted Category Rules", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/categories") {
        return [
          {
            id: "42",
            name: "Housing",
            description: null,
            color: "teal",
            isActive: true,
          },
          {
            id: "43",
            name: "Archived",
            description: null,
            color: "rose",
            isActive: false,
          },
        ];
      }

      if (path === "/category-rules") {
        return [
          {
            id: "1",
            categoryId: "42",
            pattern: "  Green   Market ",
            matchType: "exact",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "2",
            categoryId: "42",
            pattern: "Market",
            matchType: "contains",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ];
      }

      throw new Error(`Unexpected GET ${path}`);
    });
    const apiClient = { get } as unknown as StatementImportApiClient;

    await expect(getCategoryOptions(apiClient)).resolves.toEqual([
      { value: "42", label: "Housing", color: "teal" },
    ]);
    await expect(getCategoryRules(apiClient)).resolves.toEqual([
      {
        id: "1",
        categoryId: "42",
        pattern: "  Green   Market ",
        matchType: "exact",
      },
      {
        id: "2",
        categoryId: "42",
        pattern: "Market",
        matchType: "contains",
      },
    ]);
    expect(get).toHaveBeenNthCalledWith(1, "/categories", {
      signal: undefined,
    });
    expect(get).toHaveBeenNthCalledWith(2, "/category-rules", {
      signal: undefined,
    });
  });

  it("treats an existing same-Category Rule as idempotent and reports conflicts without posting", async () => {
    const post = vi.fn();
    const apiClient = { post } as unknown as StatementImportApiClient;

    await expect(
      rememberCategoryRule(
        apiClient,
        {
          pattern: " green   market ",
          categoryId: "42",
          matchType: "exact",
        },
        [createRule()],
      ),
    ).resolves.toMatchObject({ status: "existing" });
    await expect(
      rememberCategoryRule(
        apiClient,
        {
          pattern: "GREEN MARKET",
          categoryId: "99",
          matchType: "exact",
        },
        [createRule()],
      ),
    ).resolves.toEqual({
      status: "conflict",
      conflict: {
        normalizedPattern: "GREEN MARKET",
        requestedCategoryId: "99",
        existingCategoryId: "42",
        message: expect.stringContaining("already assigns Category 42"),
      },
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("posts a normalized new Category Rule", async () => {
    const post = vi.fn(async (...args: [string, unknown]) => {
      void args;
      return {
        id: "7",
        categoryId: "42",
        pattern: "GREEN MARKET",
        matchType: "exact" as const,
      };
    });
    const apiClient = { post } as unknown as StatementImportApiClient;

    await expect(
      rememberCategoryRule(
        apiClient,
        {
          pattern: " green   market ",
          categoryId: "42",
          matchType: "exact",
        },
        [],
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: "created",
      rule: { categoryId: "42", pattern: "GREEN MARKET" },
    });
    expect(post).toHaveBeenCalledWith(
      "/category-rules",
      { pattern: "GREEN MARKET", categoryId: "42", matchType: "exact" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps Exact duplicate lookup separate from Contains Rules", async () => {
    const post = vi.fn(async () => ({
      id: "7",
      categoryId: "42",
      pattern: "GREEN MARKET",
      matchType: "exact" as const,
    }));
    const apiClient = { post } as unknown as StatementImportApiClient;

    await expect(
      rememberCategoryRule(
        apiClient,
        { pattern: "Green Market", categoryId: "42", matchType: "exact" },
        [createRule({ matchType: "contains" })],
      ),
    ).resolves.toMatchObject({ status: "created" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("allows one normalized pattern for each match type", async () => {
    const post = vi.fn(async () => ({
      id: "8",
      categoryId: "42",
      pattern: "GREEN MARKET",
      matchType: "contains" as const,
    }));
    const apiClient = { post } as unknown as StatementImportApiClient;

    await expect(
      rememberCategoryRule(
        apiClient,
        { pattern: "Green Market", categoryId: "42", matchType: "contains" },
        [createRule()],
      ),
    ).resolves.toMatchObject({
      status: "created",
      rule: { categoryId: "42", pattern: "GREEN MARKET", matchType: "contains" },
    });
    expect(post).toHaveBeenCalledWith(
      "/category-rules",
      { pattern: "GREEN MARKET", categoryId: "42", matchType: "contains" },
      { signal: undefined },
    );
  });

  it("rejects an empty remembered pattern before posting", async () => {
    const post = vi.fn();

    await expect(
      rememberCategoryRule(
        { post } as unknown as StatementImportApiClient,
        { pattern: "   ", categoryId: "42", matchType: "contains" },
        [],
      ),
    ).rejects.toThrow("non-empty pattern");
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects a malformed rule match type from the collection", async () => {
    const get = vi.fn(async () => [
      {
        id: "1",
        categoryId: "42",
        pattern: "Green Market",
        matchType: "fuzzy",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await expect(
      getCategoryRules({ get } as unknown as StatementImportApiClient),
    ).rejects.toThrow("invalid Category Rule list");
  });

  it("rejects malformed rule identities and patterns from the collection", async () => {
    const malformedRules = [
      createRule({ id: "0" }),
      createRule({ categoryId: "not-a-category" }),
      createRule({ pattern: "x".repeat(501) }),
    ];

    for (const malformedRule of malformedRules) {
      const get = vi.fn(async () => [
        {
          ...malformedRule,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      await expect(
        getCategoryRules({ get } as unknown as StatementImportApiClient),
      ).rejects.toThrow("invalid Category Rule list");
    }
  });

  it("rejects a remembered rule response that changes its Category or match type", async () => {
    const responses = [
      {
        id: "7",
        categoryId: "99",
        pattern: "GREEN MARKET",
        matchType: "contains" as const,
      },
      {
        id: "8",
        categoryId: "42",
        pattern: "GREEN MARKET",
        matchType: "exact" as const,
      },
    ];

    for (const response of responses) {
      const post = vi.fn(async () => response);

      await expect(
        rememberCategoryRule(
          { post } as unknown as StatementImportApiClient,
          { pattern: "Green Market", categoryId: "42", matchType: "contains" },
          [],
        ),
      ).rejects.toThrow(/Category|Exact/);
    }
  });

  it("treats a concurrent same-Category Rule conflict as success", async () => {
    const post = vi.fn(async () => {
      throw new ApiError("Pattern already exists", {
        kind: "http",
        status: 409,
        code: "CATEGORY_RULE_PATTERN_ALREADY_EXISTS",
      });
    });
    const get = vi.fn(async () => [
      createRule({ categoryId: "99" }),
      createRule({
        id: "2",
        categoryId: "42",
        matchType: "contains",
      }),
    ]);
    const apiClient = { get, post } as unknown as StatementImportApiClient;

    await expect(
      rememberCategoryRule(
        apiClient,
        { pattern: "Green Market", categoryId: "42", matchType: "contains" },
        [],
      ),
    ).resolves.toMatchObject({ status: "existing" });
    expect(get).toHaveBeenCalledWith("/category-rules", {
      signal: undefined,
    });
  });

  it("projects supported Statement Import history fields", async () => {
    const get = vi.fn(async () => ({
      items: [
        {
          id: "100",
          fileName: "august.pdf",
          statementDate: "2026-08-31",
          bank: "BDO",
          cardType: "AMEX",
          importedAt: "2026-09-01T00:00:00.000Z",
          transactionCount: "12",
        },
      ],
      nextCursor: null,
    }));
    const apiClient = { get } as unknown as StatementImportApiClient;

    await expect(getRecentImports(apiClient)).resolves.toEqual([
      {
        id: "100",
        fileName: "august.pdf",
        transactionCount: 12,
        statementDate: "AUG 31",
        provider: "BDO",
        accountType: "AMEX",
      },
    ]);
    expect(get).toHaveBeenCalledWith(
      "/statement-imports?pageSize=3",
      { signal: undefined },
    );
  });
});

describe("Statement Import commit", () => {
  it("includes negative Transactions and keeps excluded rows out of imported Transactions", () => {
    const transactions = createCategorizedStatement().transactions;

    expect(getIncludedTransactions(transactions)).toEqual([
      expect.objectContaining({ id: "transaction-1" }),
    ]);
    expect(isIncludedStatementTransaction(transactions[1])).toBe(false);
    expect(isIncludedStatementTransaction(transactions[2])).toBe(false);
  });

  it("marks an edited Transaction Manual and permanently excludes a positive edit", () => {
    const transactions = createCategorizedStatement().transactions;

    expect(
      applyManualTransactionEdit(transactions, {
        transactionId: "transaction-1",
        transactionDate: new Date("2026-08-30T00:00:00.000Z"),
        description: "  Updated   purchase ",
        amount: 1.005,
        categoryId: "99",
      })[0],
    ).toMatchObject({
      description: "Updated purchase",
      amount: 1.005,
      categoryId: "99",
      assignment: "manual",
      isExcluded: true,
    });
  });

  it("hashes the original file as lowercase SHA-256", async () => {
    const file = new File(["hello"], "statement.pdf", {
      type: "application/pdf",
    });

    await expect(hashStatementFile(file)).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("builds a commit payload with only included negative Transactions", () => {
    expect(
      buildCommitPayload(
        "  august   statement.pdf ",
        "a".repeat(64),
        createCategorizedStatement(),
      ),
    ).toEqual({
      fileName: "august statement.pdf",
      fileHash: "a".repeat(64),
      statementDate: "2026-08-31",
      bank: "BDO",
      cardType: "AMEX",
      transactions: [
        {
          categoryId: "42",
          purchaseDate: "2026-08-29",
          description: "Green Market",
          amount: "25.50",
        },
      ],
      acknowledgeProbableDuplicates: false,
    });
  });

  it("keeps recipient-matched Debit rows visible but omits them from confirmation", () => {
    const statement = applyGcashRecipientExclusion(
      {
        summary: {
          statementDate: new Date("2026-08-31T00:00:00.000Z"),
          provider: "GCash",
          accountType: "E-Wallet",
          totalTransactions: 2,
          totalAmountDue: 4025,
          totalExtractedAmount: -4025,
        },
        transactions: [
          {
            ...createTransaction({
              description:
                "Transfer from 09111111111 to 09999999999 [Ref. #: 1]",
              amount: -4000,
            }),
            id: "recipient-transfer",
            categoryId: null,
            assignment: "unmapped",
            matchedCategoryIds: [],
            isExcluded: false,
          },
          {
            ...createTransaction({
              description: "Payment to merchant",
              amount: -25,
            }),
            id: "merchant-payment",
            categoryId: "42",
            assignment: "rule",
            matchedCategoryIds: ["42"],
            isExcluded: false,
          },
        ],
      },
      "09999999999",
    );

    expect(statement.transactions[0]).toMatchObject({
      amount: 4000,
      isExcluded: true,
      description:
        "Transfer from 09111111111 to 09999999999 [Ref. #: 1]",
    });
    expect(buildCommitPayload("wallet.pdf", "a".repeat(64), statement)).toEqual(
      expect.objectContaining({
        transactions: [
          {
            categoryId: "42",
            purchaseDate: "2026-08-29",
            description: "Payment to merchant",
            amount: "25.00",
          },
        ],
      }),
    );
  });

  it("requires a Category for every included Transaction", () => {
    const statement = createCategorizedStatement();
    statement.transactions[0] = {
      ...statement.transactions[0],
      categoryId: null,
      assignment: "unmapped",
    };

    expect(() =>
      buildCommitPayload("statement.pdf", "a".repeat(64), statement),
    ).toThrow("must have a Category before import");
  });

  it("rejects an empty Category identifier for an included Transaction", () => {
    const statement = createCategorizedStatement();
    statement.transactions[0] = {
      ...statement.transactions[0],
      categoryId: "",
      assignment: "unmapped",
    };

    expect(() =>
      buildCommitPayload("statement.pdf", "a".repeat(64), statement),
    ).toThrow("must have a Category before import");
  });

  it("rejects reviewed amounts that are not exact cents", () => {
    const statement = createCategorizedStatement();
    statement.transactions[0] = {
      ...statement.transactions[0],
      amount: -1.005,
    };

    expect(() =>
      buildCommitPayload("statement.pdf", "a".repeat(64), statement),
    ).toThrow("no more than two decimal places");
  });

  it("commits reviewed data and sends explicit probable-duplicate acknowledgement", async () => {
    const file = new File(["hello"], "statement.pdf", {
      type: "application/pdf",
    });
    const post = vi.fn(async (...args: [string, unknown]) => {
      void args;
      return {
        id: "100",
        fileName: "statement.pdf",
        statementDate: "2026-08-31",
        bank: "BDO",
        cardType: "AMEX",
        importedAt: "2026-09-01T00:00:00.000Z",
      };
    });
    const apiClient = { post } as unknown as StatementImportApiClient;

    await expect(
      commitStatementImport(
        apiClient,
        file,
        createCategorizedStatement(),
        { acknowledgeProbableDuplicates: true },
      ),
    ).resolves.toMatchObject({
      id: "100",
      transactionCount: 1,
      provider: "BDO",
      accountType: "AMEX",
    });
    expect(post).toHaveBeenCalledWith(
      "/statement-imports",
      expect.objectContaining({
        fileHash:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        acknowledgeProbableDuplicates: true,
        transactions: [
          expect.objectContaining({ categoryId: "42", amount: "25.50" }),
        ],
      }),
      { signal: undefined },
    );
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("file");
  });

  it("leaves exact file duplicate conflicts terminal", async () => {
    const file = new File(["hello"], "statement.pdf", {
      type: "application/pdf",
    });
    const duplicateError = new ApiError("The statement file has already been imported", {
      kind: "http",
      status: 409,
      code: "STATEMENT_IMPORT_FILE_ALREADY_EXISTS",
    });
    const post = vi.fn(async () => {
      throw duplicateError;
    });
    const apiClient = { post } as unknown as StatementImportApiClient;

    await expect(
      commitStatementImport(apiClient, file, createCategorizedStatement()),
    ).rejects.toBe(duplicateError);
    expect(post).toHaveBeenCalledWith(
      "/statement-imports",
      expect.objectContaining({ acknowledgeProbableDuplicates: false }),
      { signal: undefined },
    );
  });

  it("exposes probable duplicate details without treating them as an automatic acknowledgement", () => {
    const error = new ApiError("Probable duplicates", {
      kind: "http",
      status: 409,
      code: "STATEMENT_IMPORT_PROBABLE_DUPLICATES",
      details: [
        {
          field: "/transactions/0",
          code: "probable_duplicate",
          message: "Duplicate row",
          transactionIndexes: [0, 2],
          committedTransactionIds: ["12"],
        },
      ],
    });

    expect(getProbableDuplicateConflict(error)).toEqual({
      message: "Probable duplicates",
      details: [
        {
          field: "/transactions/0",
          code: "probable_duplicate",
          message: "Duplicate row",
          transactionIndexes: [0, 2],
          committedTransactionIds: ["12"],
        },
      ],
    });
  });
});
