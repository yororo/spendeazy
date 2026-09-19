import { describe, expect, it, vi } from "vitest";

import type {
  CategoryCatalogOption,
  CategoryColorOption,
  CategoryRule,
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
) {
  return createStatementImportWorkflow({
    getCategoryOptions: () => categoryOptions,
    getCategoryLabels: () => categoryLabels,
    rememberCategoryRule,
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

  it("remembers a rule and reclassifies only eligible nonmanual Transactions", async () => {
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
        assignment: "rule",
        categoryId: "42",
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
});
