import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

import type {
  CategoryCatalogOption,
  CategoryColorOption,
  CategoryRule,
  CommitStatementImportOptions,
  CommittedStatementImport,
  RememberCategoryRuleInput,
  RememberCategoryRuleResult,
} from "./statement-import-service";
import type {
  CategorizedStatement,
  CategorizedTransaction,
} from "./statement-categorizer";
import { createStatementImportWorkflow } from "./statement-import-workflow";

const summary: CategorizedStatement["summary"] = {
  statementDate: new Date("2026-08-31T00:00:00.000Z"),
  provider: "BDO",
  accountType: "AMEX",
  totalTransactions: 1,
  totalAmountDue: 25.5,
  totalExtractedAmount: -25.5,
};

const transaction: CategorizedTransaction = {
  id: "transaction-1",
  transactionDate: new Date("2026-08-29T00:00:00.000Z"),
  postingDate: new Date("2026-08-30T00:00:00.000Z"),
  description: "Green Market Cafe",
  amount: -25.5,
  categoryId: null,
  assignment: "unmapped",
  matchedCategoryIds: [],
  isExcluded: false,
};

const categoryOptions: readonly CategoryColorOption[] = [
  { value: "42", label: "Housing", color: "teal" },
  { value: "43", label: "Groceries", color: "forest" },
];

const categoryLabels: readonly CategoryCatalogOption[] = [
  { ...categoryOptions[0], isActive: true },
  { ...categoryOptions[1], isActive: true },
];

const categoryRules: readonly CategoryRule[] = [
  { id: "1", categoryId: "42", pattern: "Green", matchType: "contains" },
];

const committedImport: CommittedStatementImport = {
  id: "import-1",
  fileName: "statement.pdf",
  statementDate: "2026-08-31",
  provider: "BDO",
  accountType: "AMEX",
  importedAt: "2026-09-01T00:00:00.000Z",
  transactionCount: 1,
  importedByUserId: "10",
};

type CommitStatementImport = (
  file: File,
  statement: CategorizedStatement,
  options: CommitStatementImportOptions,
) => Promise<CommittedStatementImport>;

function createWorkflow(
  rememberCategoryRule: (
    input: RememberCategoryRuleInput,
    existingRules: readonly CategoryRule[],
  ) => Promise<RememberCategoryRuleResult> = async () => ({
    status: "created",
    rule: {
      id: "2",
      categoryId: "42",
      pattern: "CAFE",
      matchType: "contains",
    },
  }),
  commitStatementImport: CommitStatementImport = () =>
    Promise.resolve(committedImport),
) {
  return createStatementImportWorkflow({
    getCategoryOptions: () => categoryOptions,
    getCategoryLabels: () => categoryLabels,
    rememberCategoryRule,
    commitStatementImport,
  });
}

function acceptStatement(
  workflow: ReturnType<typeof createStatementImportWorkflow>,
  transactions: readonly CategorizedTransaction[] = [transaction],
) {
  workflow.acceptPreparedStatement(
    new File(["statement"], "statement.pdf", { type: "application/pdf" }),
    { summary, transactions: [...transactions] },
    categoryRules,
  );
  workflow.beginCategorizeSession(categoryRules);
}

function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value: T) {
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      rejectPromise(reason);
    },
  };
}

function withTransaction(
  overrides: Partial<CategorizedTransaction>,
): CategorizedTransaction {
  return { ...transaction, ...overrides };
}

function acceptReviewableStatement(
  workflow: ReturnType<typeof createStatementImportWorkflow>,
  transactions: readonly CategorizedTransaction[] = [
    withTransaction({
      categoryId: "42",
      assignment: "manual",
    }),
  ],
) {
  acceptStatement(workflow, transactions);
  expect(workflow.enterReview()).toBe(true);
}

function createProbableDuplicateError() {
  return new ApiError("Probable duplicate Transactions found.", {
    kind: "http",
    status: 409,
    code: "STATEMENT_IMPORT_PROBABLE_DUPLICATES",
    details: [
      {
        field: "description",
        code: "probable_duplicate",
        message: "Description matched an existing Transaction.",
        transactionIndexes: [0],
        committedTransactionIds: ["existing-transaction"],
      },
    ],
  });
}

function createFileDuplicateError() {
  return new ApiError("The statement file has already been imported.", {
    kind: "http",
    status: 409,
    code: "STATEMENT_IMPORT_FILE_ALREADY_EXISTS",
  });
}

function createCategoryEligibilityError() {
  return new ApiError('Category is inactive', {
    kind: 'http',
    status: 409,
    code: 'CATEGORY_INACTIVE',
    details: [
      {
        field: '/transactions/0/categoryId',
        code: 'category_inactive',
        message: 'The reviewed transaction uses an inactive Category',
        categoryId: '42',
        transactionIndexes: [0],
      },
    ],
  });
}

describe("Statement Import workflow", () => {
  it("owns the accepted statement and manual edit lifecycle", async () => {
    const workflow = createWorkflow();
    acceptStatement(workflow);

    expect(workflow.getSnapshot()).toMatchObject({
      stage: "categorize",
      importedFile: expect.objectContaining({ name: "statement.pdf" }),
      statement: expect.objectContaining({
        transactions: [transaction],
      }),
      canEnterReview: false,
    });

    expect(workflow.beginEdit("transaction-1")).toBe(true);
    workflow.changeDraft({
      date: "2026-08-28",
      description: "  Cafe lunch  ",
      amount: "31.25",
      category: "42",
    });

    await expect(workflow.saveEdit()).resolves.toBe("saved");

    expect(workflow.getSnapshot()).toMatchObject({
      editor: {
        editingId: null,
        draft: null,
        isSaving: false,
      },
      canEnterReview: true,
      statement: {
        transactions: [
          expect.objectContaining({
            id: "transaction-1",
            transactionDate: new Date("2026-08-28T00:00:00.000Z"),
            description: "Cafe lunch",
            amount: 31.25,
            categoryId: "42",
            assignment: "manual",
            matchedCategoryIds: [],
            isExcluded: true,
          }),
        ],
      },
    });

    expect(workflow.enterReview()).toBe(true);
    expect(workflow.getSnapshot().stage).toBe("review");
  });

  it("remembers a rule without rewriting other reviewed Transactions", async () => {
    const rememberCategoryRule = vi.fn(
      async (input: RememberCategoryRuleInput) => ({
        status: "created" as const,
        rule: {
          id: "2",
          categoryId: input.categoryId,
          pattern: input.pattern,
          matchType: input.matchType,
        },
      }),
    );
    const workflow = createWorkflow(rememberCategoryRule);
    const manualTransaction = withTransaction({
      id: "transaction-3",
      description: "Cafe manual choice",
      categoryId: "43",
      assignment: "manual",
      matchedCategoryIds: [],
    });
    const excludedTransaction = withTransaction({
      id: "transaction-4",
      description: "Cafe refund",
      amount: 5,
      categoryId: "43",
      assignment: "manual",
      matchedCategoryIds: [],
      isExcluded: true,
    });
    acceptStatement(workflow, [
      transaction,
      withTransaction({
        id: "transaction-2",
        description: "Green Cafe",
      }),
      manualTransaction,
      excludedTransaction,
    ]);

    expect(workflow.beginEdit("transaction-1")).toBe(true);
    workflow.changeDraft({
      date: "2026-08-29",
      description: "Green Market Cafe",
      amount: "25.50",
      category: "42",
    });
    workflow.changeRememberRule(true);
    workflow.changeRememberedPattern("  Cafe  ");

    await expect(workflow.saveEdit()).resolves.toBe("saved");

    expect(rememberCategoryRule).toHaveBeenCalledWith(
      { pattern: "CAFE", categoryId: "42", matchType: "contains" },
      categoryRules,
    );
    expect(workflow.getSnapshot().categoryRules).toContainEqual({
      id: "2",
      categoryId: "42",
      pattern: "CAFE",
      matchType: "contains",
    });
    expect(workflow.getSnapshot().statement?.transactions).toEqual([
      expect.objectContaining({
        id: "transaction-1",
        assignment: "manual",
        categoryId: "42",
        matchedCategoryIds: [],
      }),
      expect.objectContaining({
        id: "transaction-2",
        assignment: "unmapped",
        categoryId: null,
        matchedCategoryIds: [],
      }),
      manualTransaction,
      excludedTransaction,
    ]);
  });

  it("retains the full draft after failure and allows a retry", async () => {
    let attempt = 0;
    const rememberCategoryRule = vi.fn(
      async (input: RememberCategoryRuleInput) => {
        attempt += 1;
        if (attempt === 1) throw new Error("Rule service unavailable.");

        return {
          status: "created" as const,
          rule: {
            id: "2",
            categoryId: input.categoryId,
            pattern: input.pattern,
            matchType: input.matchType,
          },
        };
      },
    );
    const workflow = createWorkflow(rememberCategoryRule);
    acceptStatement(workflow);
    expect(workflow.beginEdit("transaction-1")).toBe(true);
    const draft = {
      date: "2026-08-28",
      description: "Changed description",
      amount: "31.25",
      category: "42",
    } as const;
    workflow.changeDraft(draft);
    workflow.changeRememberRule(true);
    workflow.changeRememberedMatchType("exact");
    workflow.changeRememberedPattern("Custom pattern");

    await expect(workflow.saveEdit()).resolves.toBe("failed");
    expect(workflow.getSnapshot().editor).toMatchObject({
      draft,
      draftError: "Rule service unavailable.",
      rememberRule: true,
      rememberedMatchType: "exact",
      rememberedPattern: "Custom pattern",
      isSaving: false,
    });

    await expect(workflow.saveEdit()).resolves.toBe("saved");
    expect(rememberCategoryRule).toHaveBeenCalledTimes(2);
    expect(workflow.getSnapshot().editor.editingId).toBeNull();
  });

  it("keeps a conflicting rule draft open until the pattern is corrected", async () => {
    const rememberCategoryRule = vi
      .fn<
        (
          input: RememberCategoryRuleInput,
          existingRules: readonly CategoryRule[],
        ) => Promise<RememberCategoryRuleResult>
      >()
      .mockResolvedValueOnce({
        status: "conflict",
        conflict: {
          normalizedPattern: "GREEN MARKET CAFE",
          requestedCategoryId: "42",
          existingCategoryId: "43",
          message:
            "The Contains Category Rule for “GREEN MARKET CAFE” already assigns Category 43. It was not changed.",
        },
      })
      .mockImplementationOnce(async (input) => ({
        status: "created",
        rule: {
          id: "2",
          categoryId: input.categoryId,
          pattern: input.pattern,
          matchType: input.matchType,
        },
      }));
    const workflow = createWorkflow(rememberCategoryRule);
    acceptStatement(workflow);
    workflow.beginEdit("transaction-1");
    workflow.changeDraft({
      date: "2026-08-29",
      description: "Green Market Cafe",
      amount: "25.50",
      category: "42",
    });
    workflow.changeRememberRule(true);
    workflow.changeRememberedPattern("Green Market Cafe");

    await expect(workflow.saveEdit()).resolves.toBe("conflict");
    expect(workflow.getSnapshot().editor.draftError).toContain(
      "Existing Category: “Groceries”.",
    );
    expect(workflow.getSnapshot().editor.draft).not.toBeNull();

    workflow.changeRememberedPattern("Cafe");
    await expect(workflow.saveEdit()).resolves.toBe("saved");
    expect(rememberCategoryRule).toHaveBeenCalledTimes(2);
  });

  it("locks same-tick repeated saves to one persistence request", async () => {
    const response = createDeferred<RememberCategoryRuleResult>();
    const rememberCategoryRule = vi.fn(() => response.promise);
    const workflow = createWorkflow(rememberCategoryRule);
    acceptStatement(workflow);
    workflow.beginEdit("transaction-1");
    workflow.changeDraft({
      date: "2026-08-29",
      description: "Green Market Cafe",
      amount: "25.50",
      category: "42",
    });
    workflow.changeRememberRule(true);

    const firstSave = workflow.saveEdit();
    const repeatedSave = workflow.saveEdit();

    await expect(repeatedSave).resolves.toBe("ignored");
    expect(rememberCategoryRule).toHaveBeenCalledTimes(1);
    expect(workflow.getSnapshot().editor.isSaving).toBe(true);

    response.resolve({
      status: "created",
      rule: {
        id: "2",
        categoryId: "42",
        pattern: "GREEN MARKET CAFE",
        matchType: "contains",
      },
    });
    await expect(firstSave).resolves.toBe("saved");
  });

  it("abandons a displaced save without changing a replacement statement", async () => {
    const abandonedResponse = createDeferred<RememberCategoryRuleResult>();
    const currentResponse = createDeferred<RememberCategoryRuleResult>();
    let attempt = 0;
    const rememberCategoryRule = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? abandonedResponse.promise
        : currentResponse.promise;
    });
    const workflow = createWorkflow(rememberCategoryRule);
    acceptStatement(workflow);
    workflow.beginEdit("transaction-1");
    workflow.changeDraft({
      date: "2026-08-29",
      description: "Abandoned draft",
      amount: "91.00",
      category: "42",
    });
    workflow.changeRememberRule(true);
    const abandonedSave = workflow.saveEdit();

    workflow.backToUpload();
    const replacement = withTransaction({
      description: "Replacement Transaction",
    });
    acceptStatement(workflow, [replacement]);
    workflow.beginCategorizeSession(categoryRules);
    workflow.beginEdit("transaction-1");
    workflow.changeDraft({
      date: "2026-08-29",
      description: "Current draft",
      amount: "42.00",
      category: "43",
    });
    workflow.changeRememberRule(true);
    const currentSave = workflow.saveEdit();

    abandonedResponse.resolve({
      status: "created",
      rule: {
        id: "2",
        categoryId: "42",
        pattern: "ABANDONED DRAFT",
        matchType: "contains",
      },
    });
    await expect(abandonedSave).resolves.toBe("abandoned");
    expect(workflow.getSnapshot().editor).toMatchObject({
      editingId: "transaction-1",
      isSaving: true,
      draft: expect.objectContaining({ description: "Current draft" }),
    });
    expect(workflow.getSnapshot().statement?.transactions).toEqual([
      replacement,
    ]);

    currentResponse.resolve({
      status: "created",
      rule: {
        id: "3",
        categoryId: "43",
        pattern: "CURRENT DRAFT",
        matchType: "contains",
      },
    });
    await expect(currentSave).resolves.toBe("saved");
    expect(workflow.getSnapshot().statement?.transactions[0]).toMatchObject({
      description: "Current draft",
      categoryId: "43",
      assignment: "manual",
    });
  });

  it("abandons the editor on Categorize displacement while retaining saved Transactions", async () => {
    const response = createDeferred<RememberCategoryRuleResult>();
    const workflow = createWorkflow(() => response.promise);
    acceptStatement(workflow, [
      withTransaction({
        categoryId: "42",
        assignment: "manual",
        matchedCategoryIds: [],
      }),
    ]);
    workflow.beginEdit("transaction-1");
    workflow.changeDraft({
      date: "2026-08-29",
      description: "Unsaved draft",
      amount: "25.50",
      category: "43",
    });
    workflow.changeRememberRule(true);
    const save = workflow.saveEdit();

    workflow.abandonCategorizeSession();
    expect(workflow.getSnapshot()).toMatchObject({
      editor: {
        editingId: null,
        draft: null,
        isSaving: false,
      },
      statement: {
        transactions: [
          expect.objectContaining({
            description: "Green Market Cafe",
            categoryId: "42",
          }),
        ],
      },
    });

    response.resolve({
      status: "created",
      rule: {
        id: "2",
        categoryId: "43",
        pattern: "UNSAVED DRAFT",
        matchType: "contains",
      },
    });
    await expect(save).resolves.toBe("abandoned");
    expect(workflow.getSnapshot().categoryRules).toEqual(categoryRules);
  });

  it("confirms the workflow-owned statement in its existing row order", async () => {
    const commitStatementImport = vi.fn(async () => committedImport);
    const workflow = createWorkflow(undefined, commitStatementImport);
    const firstTransaction = withTransaction({
      id: "transaction-1",
      description: "First Transaction",
      categoryId: "42",
      assignment: "manual",
    });
    const excludedTransaction = withTransaction({
      id: "transaction-2",
      description: "Excluded Transaction",
      categoryId: "43",
      assignment: "manual",
      isExcluded: true,
    });

    acceptReviewableStatement(workflow, [firstTransaction, excludedTransaction]);
    expect(workflow.getSnapshot().commit.canConfirm).toBe(true);

    await expect(workflow.confirmStatementImport(false)).resolves.toBe(
      "committed",
    );
    expect(commitStatementImport).toHaveBeenCalledWith(
      expect.objectContaining({ name: "statement.pdf" }),
      expect.objectContaining({
        transactions: [firstTransaction, excludedTransaction],
      }),
      { acknowledgeProbableDuplicates: false },
    );
    expect(workflow.getSnapshot().commit).toMatchObject({
      result: committedImport,
      isCommitting: false,
      error: null,
      canConfirm: false,
    });
  });

  it("keeps a failed confirmation available for a normal retry", async () => {
    const commitStatementImport = vi
      .fn<CommitStatementImport>()
      .mockRejectedValueOnce(new Error("The API is unavailable."))
      .mockResolvedValueOnce(committedImport);
    const workflow = createWorkflow(undefined, commitStatementImport);
    acceptReviewableStatement(workflow);

    await expect(workflow.confirmStatementImport(false)).resolves.toBe("failed");
    expect(workflow.getSnapshot().commit).toMatchObject({
      error: expect.objectContaining({ message: "The API is unavailable." }),
      canConfirm: true,
      isCommitting: false,
    });

    await expect(workflow.confirmStatementImport(false)).resolves.toBe(
      "committed",
    );
    expect(commitStatementImport).toHaveBeenCalledTimes(2);
  });

  it('preserves reviewed rows and exposes inactive Category assignments for correction', async () => {
    const commitStatementImport = vi
      .fn<CommitStatementImport>()
      .mockRejectedValue(createCategoryEligibilityError());
    const workflow = createWorkflow(undefined, commitStatementImport);
    const reviewedTransactions = [
      withTransaction({ categoryId: '42', assignment: 'manual' }),
      withTransaction({
        id: 'transaction-2',
        description: 'Second Transaction',
        categoryId: '43',
        assignment: 'manual',
      }),
    ];
    acceptReviewableStatement(workflow, reviewedTransactions);

    await expect(workflow.confirmStatementImport(false)).resolves.toBe('failed');

    expect(workflow.getSnapshot()).toMatchObject({
      statement: { transactions: reviewedTransactions },
      commit: {
        categoryEligibilityConflict: {
          details: [
            expect.objectContaining({
              categoryId: '42',
              transactionIndexes: [0],
            }),
          ],
        },
        canConfirm: false,
        canImportAnyway: false,
      },
    });

    expect(workflow.returnToCategorize(categoryRules)).toBe(true);
    expect(workflow.getSnapshot()).toMatchObject({
      stage: 'categorize',
      statement: { transactions: reviewedTransactions },
      commit: {
        categoryEligibilityConflict: null,
        error: null,
      },
    });
  });

  it("makes an Exact File Duplicate terminal until the review is reset", async () => {
    const commitStatementImport = vi
      .fn<CommitStatementImport>()
      .mockRejectedValue(createFileDuplicateError());
    const workflow = createWorkflow(undefined, commitStatementImport);
    acceptReviewableStatement(workflow);

    await expect(workflow.confirmStatementImport(false)).resolves.toBe("failed");
    expect(workflow.getSnapshot().commit).toMatchObject({
      hasFileDuplicate: true,
      canConfirm: false,
      canImportAnyway: false,
    });
    await expect(workflow.confirmStatementImport(false)).resolves.toBe("ignored");
    expect(commitStatementImport).toHaveBeenCalledTimes(1);
  });

  it("requires one synchronous acknowledgement attempt for Probable Duplicates", async () => {
    const acknowledgedResponse = createDeferred<CommittedStatementImport>();
    const commitStatementImport = vi
      .fn<CommitStatementImport>()
      .mockRejectedValueOnce(createProbableDuplicateError())
      .mockReturnValueOnce(acknowledgedResponse.promise);
    const workflow = createWorkflow(undefined, commitStatementImport);
    acceptReviewableStatement(workflow);

    await expect(workflow.confirmStatementImport(false)).resolves.toBe("failed");
    expect(workflow.getSnapshot().commit).toMatchObject({
      probableDuplicateConflict: expect.objectContaining({
        message: "Probable duplicate Transactions found.",
      }),
      canConfirm: false,
      canImportAnyway: true,
    });

    const acknowledgement = workflow.confirmStatementImport(true);
    await expect(workflow.confirmStatementImport(true)).resolves.toBe("ignored");
    expect(commitStatementImport).toHaveBeenCalledTimes(2);
    expect(workflow.getSnapshot().commit).toMatchObject({
      isCommitting: true,
      canImportAnyway: false,
    });

    acknowledgedResponse.resolve(committedImport);
    await expect(acknowledgement).resolves.toBe("committed");
    expect(workflow.getSnapshot().commit.result).toEqual(committedImport);
  });

  it("keeps Resolve stage-only while Review Back resets commit state and acknowledgement", async () => {
    const commitStatementImport = vi
      .fn<CommitStatementImport>()
      .mockRejectedValue(createProbableDuplicateError());
    const workflow = createWorkflow(undefined, commitStatementImport);
    acceptReviewableStatement(workflow);

    await expect(workflow.confirmStatementImport(false)).resolves.toBe("failed");
    expect(workflow.returnToCategorize(categoryRules)).toBe(true);
    expect(workflow.getSnapshot()).toMatchObject({
      stage: "categorize",
      commit: { probableDuplicateConflict: expect.any(Object) },
    });
    expect(workflow.enterReview()).toBe(true);
    expect(workflow.getSnapshot().commit.canImportAnyway).toBe(true);

    await expect(workflow.confirmStatementImport(true)).resolves.toBe("failed");
    expect(workflow.getSnapshot().commit.canImportAnyway).toBe(false);
    expect(workflow.backToCategorize(categoryRules)).toBe(true);
    expect(workflow.getSnapshot().commit).toMatchObject({
      error: null,
      probableDuplicateConflict: null,
      canImportAnyway: false,
    });
    expect(workflow.enterReview()).toBe(true);
    expect(workflow.getSnapshot().commit.canConfirm).toBe(true);
  });

  it("abandons a late confirmation when a replacement file starts", async () => {
    const response = createDeferred<CommittedStatementImport>();
    const commitStatementImport = vi
      .fn<CommitStatementImport>()
      .mockReturnValue(response.promise);
    const workflow = createWorkflow(undefined, commitStatementImport);
    acceptReviewableStatement(workflow);

    const confirmation = workflow.confirmStatementImport(false);
    expect(workflow.getSnapshot().commit.isCommitting).toBe(true);

    expect(workflow.backToUpload()).toBe(true);
    const replacement = withTransaction({
      description: "Replacement Transaction",
      categoryId: "43",
      assignment: "manual",
    });
    workflow.acceptPreparedStatement(
      new File(["replacement"], "replacement.pdf", {
        type: "application/pdf",
      }),
      { summary, transactions: [replacement] },
      categoryRules,
    );
    response.resolve(committedImport);

    await expect(confirmation).resolves.toBe("abandoned");
    expect(workflow.getSnapshot()).toMatchObject({
      stage: "categorize",
      importedFile: expect.objectContaining({ name: "replacement.pdf" }),
      statement: { transactions: [replacement] },
      commit: {
        result: null,
        error: null,
        isCommitting: false,
      },
    });
  });
});
