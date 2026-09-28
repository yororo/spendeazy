// @vitest-environment jsdom

import { useEffect, useRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategorizeStatementAdapter } from "./statement-import-workflow-adapter";
import { useStatementImportWorkflow } from "./use-statement-import-workflow";
import type {
  CategoryCatalogOption,
  CategoryColorOption,
  CategorySuggestion,
  CategorySuggestionFetcher,
  CategoryRule,
  RememberCategoryRuleInput,
  RememberCategoryRuleResult,
} from "./statement-import-service";
import type {
  CategorizedStatement,
  CategorizedTransaction,
} from "./statement-categorizer";

const summary: CategorizedStatement["summary"] = {
  statementType: "credit_card",
  statementDate: new Date("2026-08-31T00:00:00.000Z"),
  provider: "BDO",
  accountType: "AMEX",
  transactionHistoryStartDate: null,
  totalDebit: null,
  totalTransactions: 1,
  totalAmountDue: 25.5,
  totalExtractedAmount: -25.5,
};

const ambiguousTransaction: CategorizedTransaction = {
  id: "transaction-1",
  transactionDate: new Date("2026-08-29T00:00:00.000Z"),
  postingDate: new Date("2026-08-30T00:00:00.000Z"),
  description: "Green Market Cafe",
  amount: -25.5,
  categoryId: null,
  assignment: "ambiguous",
  matchedCategoryIds: ["42", "43"],
  isExcluded: false,
};

const unmappedTransaction: CategorizedTransaction = {
  ...ambiguousTransaction,
  assignment: "unmapped",
  matchedCategoryIds: [],
};

const categoryRules: readonly CategoryRule[] = [
  { id: "1", categoryId: "42", pattern: "Green", matchType: "contains" },
  { id: "2", categoryId: "43", pattern: "Market", matchType: "contains" },
];

type RememberCategoryRuleHandler = (
  input: RememberCategoryRuleInput,
  existingRules: readonly CategoryRule[],
) => Promise<RememberCategoryRuleResult>;

interface CategorizeHarnessProps {
  readonly initialTransactions?: CategorizedTransaction[];
  readonly getCategorySuggestion?: CategorySuggestionFetcher;
  readonly onRememberCategoryRule?: RememberCategoryRuleHandler;
  readonly onReview?: () => void;
  readonly resetImport?: boolean;
  readonly spaceId?: string;
  readonly categoryDescription?: string;
  readonly statementSummary?: CategorizedStatement["summary"];
}

function CategorizeHarness({
  initialTransactions = [ambiguousTransaction],
  getCategorySuggestion = async () => null,
  onReview,
  resetImport = false,
  spaceId = "77",
  categoryDescription,
  onRememberCategoryRule = async () => ({
    status: "created" as const,
    rule: {
      id: "7",
      categoryId: "42",
      pattern: "GREEN MARKET",
      matchType: "contains" as const,
    },
  }),
  statementSummary = summary,
}: CategorizeHarnessProps) {
  const categoryOptions: CategoryColorOption[] = [
    { value: "42", label: "Housing", color: "teal" },
    { value: "43", label: "Groceries", color: "forest" },
    { value: "44", label: "Dining", color: "amber" },
  ];
  const categoryLabels: CategoryCatalogOption[] = categoryOptions.map((category) => ({
    ...category,
    description: categoryDescription ?? null,
    isActive: true,
  }));
  const { workflow } = useStatementImportWorkflow({
    categoryOptions,
    categoryLabels,
    onRememberCategoryRule,
    onCommitStatementImport: async () => ({
      id: "import-1",
      fileName: "statement.pdf",
      statementDate: "2026-08-31",
      provider: "BDO",
      accountType: "AMEX",
      statementType: "credit_card",
      transactionHistoryStartDate: null,
      totalDebit: null,
      importedAt: "2026-09-01T00:00:00.000Z",
      transactionCount: 1,
      importedByUserId: "10",
    }),
  });
  const initialStatementRef = useRef({
    summary: statementSummary,
    transactions: initialTransactions,
  });

  useEffect(() => {
    workflow.acceptPreparedStatement(
      new File(["statement"], "statement.pdf", { type: "application/pdf" }),
      initialStatementRef.current,
      categoryRules,
    );
  }, [workflow]);

  useEffect(() => {
    if (resetImport) workflow.backToUpload();
  }, [resetImport, workflow]);

  return (
    <CategorizeStatementAdapter
      workflow={workflow}
      categoryOptions={categoryOptions}
      categoryLabels={categoryLabels}
      currentCategoryRules={categoryRules}
      getCategorySuggestion={getCategorySuggestion}
      spaceId={spaceId}
      fileName="statement.pdf"
      statementSummary={statementSummary}
      onBack={vi.fn()}
      onReview={onReview ?? vi.fn()}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function getDesktopTable() {
  return screen.getByRole("table", {
    name: "Transactions parsed from statement.pdf",
  });
}

describe("CategorizeStatement ambiguity handling", () => {
  it("prepares suggestions in the background once per normalized description", async () => {
    const getCategorySuggestion = vi.fn(() => new Promise<null>(() => {}));
    render(
      <CategorizeHarness
        initialTransactions={[
          unmappedTransaction,
          {
            ...unmappedTransaction,
            id: "transaction-2",
            description: "  GREEN   MARKET CAFE  ",
          },
        ]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Categorize and update" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });
    expect(getCategorySuggestion).toHaveBeenCalledWith(
      "Green Market Cafe",
      expect.any(AbortSignal),
      "77",
    );
  });

  it("keeps at most three Category Suggestion requests in flight", async () => {
    const requests = new Map<
      string,
      ReturnType<typeof createDeferred<readonly CategorySuggestion[] | null>>
    >();
    const getCategorySuggestion = vi.fn((description: string) => {
      const request = createDeferred<readonly CategorySuggestion[] | null>();
      requests.set(description, request);
      return request.promise;
    });
    render(
      <CategorizeHarness
        initialTransactions={[
          "Market One",
          "Market Two",
          "Market Three",
          "Market Four",
        ].map((description, index) => ({
          ...unmappedTransaction,
          id: `transaction-${index + 1}`,
          description,
        }))}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(3);
    });
    expect(requests.has("Market Four")).toBe(false);

    await act(async () => {
      requests.get("Market One")?.resolve(null);
    });
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(4);
    });
    expect(requests.has("Market Four")).toBe(true);
  });

  it("does not show a late result after the edited Transaction description changes", async () => {
    const originalResult = createDeferred<readonly CategorySuggestion[] | null>();
    const editedResult = createDeferred<readonly CategorySuggestion[] | null>();
    const getCategorySuggestion = vi.fn((description: string) =>
      description === "Green Market Cafe"
        ? originalResult.promise
        : editedResult.promise,
    );
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });
    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    fireEvent.change(
      within(editor).getByRole("textbox", {
        name: "Description for Green Market Cafe",
      }),
      { target: { value: "Fresh Market" } },
    );

    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      originalResult.resolve([{ categoryId: "42", categoryName: "Housing" }]);
    });
    expect(
      within(editor).queryByRole("button", {
        name: "Use suggested Category: Housing",
      }),
    ).toBeNull();

    await act(async () => {
      editedResult.resolve([{ categoryId: "43", categoryName: "Groceries" }]);
    });
    expect(
      await within(editor).findByRole("button", {
        name: "Use suggested Category: Groceries",
      }),
    ).toBeTruthy();
  });

  it("discards suggestions when the destination Space or Category catalog changes", async () => {
    const requests: Array<{
      readonly spaceId: string;
      readonly result: ReturnType<
        typeof createDeferred<readonly CategorySuggestion[] | null>
      >;
    }> = [];
    const getCategorySuggestion = vi.fn(
      (_description: string, _signal: AbortSignal, spaceId: string) => {
        const result = createDeferred<readonly CategorySuggestion[] | null>();
        requests.push({ spaceId, result });
        return result.promise;
      },
    );
    const view = render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });
    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });

    view.rerender(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
        spaceId="88"
      />,
    );
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(2);
    });
    expect(requests.map(({ spaceId }) => spaceId)).toEqual(["77", "88"]);
    await act(async () => {
      requests[0]?.result.resolve([
        { categoryId: "42", categoryName: "Housing" },
      ]);
    });
    expect(
      within(editor).queryByRole("button", {
        name: "Use suggested Category: Housing",
      }),
    ).toBeNull();
    await act(async () => {
      requests[1]?.result.resolve([
        { categoryId: "43", categoryName: "Groceries" },
      ]);
    });
    expect(
      await within(editor).findByRole("button", {
        name: "Use suggested Category: Groceries",
      }),
    ).toBeTruthy();

    view.rerender(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
        spaceId="88"
        categoryDescription="Updated Category purpose"
      />,
    );
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(3);
    });
    expect(
      within(editor).queryByRole("button", {
        name: "Use suggested Category: Groceries",
      }),
    ).toBeNull();
    await act(async () => {
      requests[2]?.result.resolve([
        { categoryId: "44", categoryName: "Dining" },
      ]);
    });
    expect(
      await within(editor).findByRole("button", {
        name: "Use suggested Category: Dining",
      }),
    ).toBeTruthy();
  });

  it("cancels obsolete suggestion work when a Transaction is excluded", async () => {
    const requests: Array<{
      readonly signal: AbortSignal;
      readonly result: ReturnType<
        typeof createDeferred<readonly CategorySuggestion[] | null>
      >;
    }> = [];
    const getCategorySuggestion = vi.fn(
      (_description: string, signal: AbortSignal) => {
        const result = createDeferred<readonly CategorySuggestion[] | null>();
        requests.push({ signal, result });
        return result.promise;
      },
    );
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Exclude Green Market Cafe",
      }),
    );
    expect(requests[0]?.signal.aborted).toBe(true);
    await act(async () => {
      requests[0]?.result.resolve([
        { categoryId: "42", categoryName: "Housing" },
      ]);
    });
    expect(within(mobileList).getByText("Excluded")).toBeTruthy();

    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Include Green Market Cafe",
      }),
    );
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    expect(
      within(editor).queryByRole("button", {
        name: "Use suggested Category: Housing",
      }),
    ).toBeNull();
    expect(within(editor).getByRole("status").textContent).toContain(
      "Checking for a Category Suggestion",
    );
  });

  it("cancels suggestion work when the Statement Import is reset", async () => {
    const result = createDeferred<readonly CategorySuggestion[] | null>();
    let requestSignal: AbortSignal | undefined;
    const getCategorySuggestion = vi.fn(
      (_description: string, signal: AbortSignal) => {
        requestSignal = signal;
        return result.promise;
      },
    );
    const view = render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
        resetImport
      />,
    );
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => {
      result.resolve([{ categoryId: "42", categoryName: "Housing" }]);
    });
    expect(
      screen.queryByRole("heading", { name: "Categorize and update" }),
    ).toBeNull();
  });

  it("uses a mobile Category Suggestion as an unsaved draft until Save", async () => {
    const getCategorySuggestion = vi.fn(async () => [
      { categoryId: "43", categoryName: "Groceries" },
    ]);
    const rememberCategoryRule = vi.fn(async () => ({
      status: "created" as const,
      rule: {
        id: "8",
        categoryId: "43",
        pattern: "Green Market Cafe",
        matchType: "contains" as const,
      },
    }));
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
        onRememberCategoryRule={rememberCategoryRule}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    const suggestion = await within(editor).findByRole("button", {
      name: "Use suggested Category: Groceries",
    });
    expect(getCategorySuggestion).toHaveBeenCalledWith(
      "Green Market Cafe",
      expect.any(AbortSignal),
      "77",
    );
    fireEvent.click(suggestion);
    expect(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }).textContent,
    ).toContain("Groceries");
    expect(within(mobileList).getByText("Unmapped")).toBeTruthy();

    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    expect(within(mobileList).getByText("Unmapped")).toBeTruthy();
    expect(rememberCategoryRule).not.toHaveBeenCalled();

    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const reopenedEditor = screen.getByRole("dialog", {
      name: "Edit Transaction",
    });
    fireEvent.click(
      await within(reopenedEditor).findByRole("button", {
        name: "Use suggested Category: Groceries",
      }),
    );
    fireEvent.click(
      within(reopenedEditor).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => {
      expect(within(mobileList).getByText("Groceries")).toBeTruthy();
      expect(within(mobileList).getByText("Manual")).toBeTruthy();
    });
    expect(rememberCategoryRule).not.toHaveBeenCalled();
  });

  it("shows the mobile Suggestions available cue only for included Unmapped rows with suggestions", async () => {
    const getCategorySuggestion = vi.fn(async (description: string) =>
      description === "Green Market Cafe"
        ? [{ categoryId: "43", categoryName: "Groceries" }]
        : null,
    );
    const noSuggestionTransaction = {
      ...unmappedTransaction,
      id: "transaction-no-suggestions",
      description: "No suggestion Cafe",
    };
    const excludedTransaction = {
      ...unmappedTransaction,
      id: "transaction-excluded",
      description: "Excluded Cafe",
      isExcluded: true,
    };
    const categorizedTransaction = {
      ...unmappedTransaction,
      id: "transaction-categorized",
      description: "Already categorized Cafe",
      categoryId: "42",
      assignment: "manual" as const,
    };
    render(
      <CategorizeHarness
        initialTransactions={[
          unmappedTransaction,
          noSuggestionTransaction,
          excludedTransaction,
          categorizedTransaction,
        ]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    const cue = await within(mobileList).findByRole("button", {
      name: "Suggestions available for Green Market Cafe",
    });
    expect(cue.textContent).toContain("Suggestions available");
    for (const description of [
      "No suggestion Cafe",
      "Excluded Cafe",
      "Already categorized Cafe",
    ]) {
      expect(
        within(mobileList).queryByRole("button", {
          name: `Suggestions available for ${description}`,
        }),
      ).toBeNull();
    }

    fireEvent.click(cue);

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    expect(
      await within(editor).findByRole("button", {
        name: "Use suggested Category: Groceries",
      }),
    ).toBeTruthy();
  });

  it("shows an accessible desktop Suggestions available cue that opens the Category editor", async () => {
    const getCategorySuggestion = vi.fn(async (description: string) =>
      description === "Green Market Cafe"
        ? [{ categoryId: "43", categoryName: "Groceries" }]
        : null,
    );
    const noSuggestionTransaction = {
      ...unmappedTransaction,
      id: "transaction-no-suggestions",
      description: "No suggestion Cafe",
    };
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction, noSuggestionTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const transactionTable = getDesktopTable();
    const cue = await within(transactionTable).findByRole("button", {
      name: "Suggestions available for Green Market Cafe",
    });
    expect(cue.textContent).toContain("Suggestions available");
    expect(
      within(transactionTable).queryByRole("button", {
        name: "Suggestions available for No suggestion Cafe",
      }),
    ).toBeNull();

    fireEvent.click(cue);

    const suggestionGroup = await within(transactionTable).findByRole("group", {
      name: "Category Suggestions",
    });
    expect(
      within(suggestionGroup).getByRole("button", {
        name: "Use suggested Category: Groceries",
      }),
    ).toBeTruthy();
  });

  it("shows ordered Category Suggestions in the desktop editor and keeps the full selector available", async () => {
    const getCategorySuggestion = vi.fn(async () => [
      { categoryId: "42", categoryName: "Housing" },
      { categoryId: "43", categoryName: "Groceries" },
      { categoryId: "44", categoryName: "Dining" },
    ]);
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const transactionTable = getDesktopTable();
    fireEvent.click(
      within(transactionTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const suggestion = await within(transactionTable).findByRole("button", {
      name: "Use suggested Category: Housing",
    });
    const suggestionGroup = within(transactionTable).getByRole("group", {
      name: "Category Suggestions",
    });
    expect(
      within(suggestionGroup).getAllByRole("button", {
        name: /^Use suggested Category:/,
      }),
    ).toHaveLength(3);
    expect(
      within(suggestionGroup).getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining("Housing"),
      expect.stringContaining("Groceries"),
      expect.stringContaining("Dining"),
    ]);
    expect(
      within(transactionTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    ).toBeTruthy();
    fireEvent.click(suggestion);
    expect(
      within(transactionTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }).textContent,
    ).toContain("Housing");
  });

  it("shows nonblocking loading feedback while checking for a suggestion", async () => {
    const getCategorySuggestion = vi.fn(() => new Promise<null>(() => {}));
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    const feedback = await within(editor).findByRole("status");
    expect(feedback.textContent).toContain(
      "Checking for a Category Suggestion",
    );
    expect(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    ).toBeTruthy();
  });

  it("keeps the Category selector available after a suggestion request times out", async () => {
    vi.useFakeTimers();
    const getCategorySuggestion = vi.fn(() => new Promise<null>(() => {}));
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    const feedback = within(editor).getByRole("status");
    expect(feedback.textContent).toContain(
      "Checking for a Category Suggestion",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(feedback.textContent).toContain("Category Suggestion unavailable");
    expect(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    ).toBeTruthy();
  });

  it("shows an empty state when the API has no supported Category", async () => {
    const getCategorySuggestion = vi.fn(async () => null);
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    const feedback = await within(editor).findByRole("status");
    expect(feedback.textContent).toContain("No Category Suggestion available");
    expect(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    ).toBeTruthy();
  });

  it("shows an unavailable state without blocking manual categorization", async () => {
    const getCategorySuggestion = vi.fn(async () => {
      throw new Error("offline");
    });
    const onReview = vi.fn();
    render(
      <CategorizeHarness
        initialTransactions={[unmappedTransaction]}
        getCategorySuggestion={getCategorySuggestion}
        onReview={onReview}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    const feedback = await within(editor).findByRole("status");
    expect(feedback.textContent).toContain("Category Suggestion unavailable");
    expect(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    ).toBeTruthy();
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Groceries" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));

    const reviewButton = screen.getByRole("button", {
      name: "Review 1 Transactions",
    });
    await waitFor(() => expect(reviewButton).toHaveProperty("disabled", false));
    fireEvent.click(reviewButton);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("does not request suggestions for an Ambiguous Category Match", () => {
    const getCategorySuggestion = vi.fn(async () => [
      { categoryId: "42", categoryName: "Housing" },
    ]);
    render(<CategorizeHarness getCategorySuggestion={getCategorySuggestion} />);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    expect(getCategorySuggestion).not.toHaveBeenCalled();
    expect(
      within(
        screen.getByRole("dialog", { name: "Edit Transaction" }),
      ).getByRole("combobox", { name: "Category for Green Market Cafe" }),
    ).toBeTruthy();
  });

  it("uses the saved Category Color for an assigned Transaction", () => {
    render(
      <CategorizeHarness
        initialTransactions={[
          {
            ...ambiguousTransaction,
            categoryId: "42",
            assignment: "manual",
            matchedCategoryIds: ["42"],
          },
        ]}
      />,
    );

    expect(
      screen
        .getAllByText("Housing")[0]
        .parentElement?.querySelector('[aria-hidden="true"]')?.className,
    ).toContain("bg-category-teal");
  });

  it("offers the mobile Transaction flow alongside the desktop table", () => {
    render(<CategorizeHarness />);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    const desktopTable = screen.getByRole("table", {
      name: "Transactions parsed from statement.pdf",
    });

    expect(within(mobileList).getByText("Green Market Cafe")).toBeTruthy();
    expect(within(desktopTable).getByText("Green Market Cafe")).toBeTruthy();
    expect(
      within(mobileList).getByRole("button", {
        name: "Edit Category for Green Market Cafe",
      }),
    ).toBeTruthy();
  });

  it("leaves Unmapped assignment cells empty on mobile and desktop", () => {
    const unmappedTransaction = {
      ...ambiguousTransaction,
      description: "Unmapped Cafe",
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };

    render(<CategorizeHarness initialTransactions={[unmappedTransaction]} />);

    const mobileItem = within(
      screen.getByRole("list", { name: "Transactions to categorize" }),
    )
      .getByText("Unmapped Cafe")
      .closest("li");
    const desktopRow = within(getDesktopTable())
      .getByText("Unmapped Cafe")
      .closest("tr");

    expect(
      mobileItem && within(mobileItem).getAllByText("Unmapped"),
    ).toHaveLength(1);
    expect(
      desktopRow && within(desktopRow).getAllByText("Unmapped"),
    ).toHaveLength(1);
    expect(
      desktopRow && within(desktopRow).getAllByRole("cell")[4]?.textContent,
    ).toBe("");
  });

  it("does not mark the Sheet filters active for inline search", () => {
    render(<CategorizeHarness />);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search Transactions" }),
      {
        target: { value: "green" },
      },
    );

    expect(
      screen.getByRole("button", { name: "Filter Transactions" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Filter Transactions, filters active",
      }),
    ).toBeNull();
  });

  it("does not auto-focus the mobile From date filter when opened", () => {
    render(<CategorizeHarness />);

    fireEvent.click(
      screen.getByRole("button", { name: "Filter Transactions" }),
    );

    const filters = screen.getByRole("dialog", { name: "Filter Transactions" });
    const fromInput = within(filters).getByLabelText("From");

    expect(document.activeElement).not.toBe(fromInput);
  });

  it("edits a Transaction from the mobile editor", async () => {
    render(<CategorizeHarness />);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    const dateInput = within(editor).getByLabelText(
      "Date for Green Market Cafe",
    );
    const descriptionInput = within(editor).getByLabelText(
      "Description for Green Market Cafe",
    );
    expect(document.activeElement).toBe(editor);
    expect(document.activeElement).not.toBe(dateInput);
    expect(document.activeElement).not.toBe(descriptionInput);
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Edit Transaction" }),
      ).toBeNull();
    });
    expect(within(mobileList).getByText("Housing")).toBeTruthy();
  });

  it("uses the Transaction description for Exact Rules and only enables Contains patterns", () => {
    render(<CategorizeHarness />);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    fireEvent.click(
      within(editor).getByRole("checkbox", {
        name: "Remember this category",
      }),
    );

    const matchType = within(editor).getByRole("combobox", {
      name: "Match type for Green Market Cafe",
    });
    const pattern = within(editor).getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    const description = within(editor).getByRole("textbox", {
      name: "Description for Green Market Cafe",
    });

    expect(matchType.textContent).toContain("Contains");
    expect(pattern).toHaveProperty("value", "Green Market Cafe");
    expect(
      Boolean(
        matchType.compareDocumentPosition(pattern) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    fireEvent.change(description, {
      target: { value: "  Corrected   Merchant  " },
    });
    expect(pattern).toHaveProperty("value", "Corrected Merchant");

    fireEvent.change(pattern, { target: { value: "Merchant" } });
    fireEvent.change(description, {
      target: { value: "A different description" },
    });
    expect(pattern).toHaveProperty("value", "Merchant");

    fireEvent.click(matchType);
    fireEvent.click(screen.getByRole("option", { name: "Exact" }));
    expect(matchType.textContent).toContain("Exact");
    expect(pattern).toHaveProperty("value", "A different description");
    expect(pattern).toHaveProperty("disabled", true);

    fireEvent.click(matchType);
    fireEvent.click(screen.getByRole("option", { name: "Contains" }));
    expect(pattern).toHaveProperty("value", "A different description");
    expect(pattern).toHaveProperty("disabled", false);
  });

  it("saves the mobile Contains Rule controls and displays the Manual assignment", async () => {
    const rememberCategoryRule: RememberCategoryRuleHandler = vi.fn(
      async (input) => ({
        status: "created" as const,
        rule: {
          id: "7",
          categoryId: input.categoryId,
          pattern: input.pattern,
          matchType: input.matchType,
        },
      }),
    );

    render(<CategorizeHarness onRememberCategoryRule={rememberCategoryRule} />);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(editor).getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    fireEvent.change(
      within(editor).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
      { target: { value: "  Cafe  " } },
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Edit Transaction" }),
      ).toBeNull();
    });
    expect(rememberCategoryRule).toHaveBeenCalledWith(
      { pattern: "CAFE", categoryId: "42", matchType: "contains" },
      categoryRules,
    );

    const directItem = within(mobileList)
      .getByText("Green Market Cafe")
      .closest("li");
    expect(directItem && within(directItem).getByText("Housing")).toBeTruthy();
    expect(directItem && within(directItem).getByText("Manual")).toBeTruthy();
  });

  it("keeps mobile Rule selections visible when persistence fails", async () => {
    const rememberCategoryRule: RememberCategoryRuleHandler = vi.fn(
      async () => {
        throw new Error("Rule service unavailable.");
      },
    );

    render(<CategorizeHarness onRememberCategoryRule={rememberCategoryRule} />);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(editor).getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Exact" }));
    fireEvent.change(
      within(editor).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
      { target: { value: "  Cafe  " } },
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save changes" }),
    );

    expect(await screen.findByText("Rule service unavailable.")).toBeTruthy();
    const recoveredEditor = screen.getByRole("dialog", {
      name: "Edit Transaction",
    });
    expect(
      within(recoveredEditor)
        .getByRole("checkbox", {
          name: "Remember this category",
        })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      within(recoveredEditor).getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }).textContent,
    ).toContain("Exact");
    expect(
      within(recoveredEditor).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
    ).toHaveProperty("value", "  Cafe  ");
  });

  it("keeps mobile Rule selections visible when the pattern is invalid", async () => {
    const rememberCategoryRule: RememberCategoryRuleHandler = vi.fn(
      async () => ({
        status: "created" as const,
        rule: {
          id: "7",
          categoryId: "42",
          pattern: "CAFE",
          matchType: "exact" as const,
        },
      }),
    );

    render(<CategorizeHarness onRememberCategoryRule={rememberCategoryRule} />);

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Transaction" });
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(editor).getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    fireEvent.click(
      within(editor).getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Exact" }));
    fireEvent.change(
      within(editor).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
      { target: { value: "   " } },
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await screen.findByText("A Category Rule requires a non-empty pattern."),
    ).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Edit Transaction" }),
    ).toBeTruthy();
    expect(rememberCategoryRule).not.toHaveBeenCalled();
    expect(
      within(editor).getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }).textContent,
    ).toContain("Exact");
    expect(
      within(editor).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
    ).toHaveProperty("value", "   ");
  });

  it("applies mobile Sheet filters immediately", () => {
    render(
      <CategorizeHarness
        initialTransactions={[
          ambiguousTransaction,
          {
            ...ambiguousTransaction,
            id: "transaction-2",
            description: "Rent payment",
            categoryId: "42",
            assignment: "rule",
            matchedCategoryIds: [],
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Filter Transactions" }),
    );
    const filters = screen.getByRole("dialog", { name: "Filter Transactions" });
    fireEvent.click(
      within(filters).getByRole("combobox", { name: "Category" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Unmapped" }));
    fireEvent.click(
      within(filters).getByRole("button", { name: "Close navigation" }),
    );

    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    expect(within(mobileList).getByText("Green Market Cafe")).toBeTruthy();
    expect(within(mobileList).queryByText("Rent payment")).toBeNull();
  });

  it("shows candidate Categories, blocks Review, and clears ambiguity after manual resolution", async () => {
    render(<CategorizeHarness />);

    const desktopTable = getDesktopTable();
    expect(
      within(desktopTable).getByText("Multiple categories matched"),
    ).toBeTruthy();
    expect(within(desktopTable).getByText("Housing, Groceries")).toBeTruthy();
    expect(screen.getAllByText("1 Ambiguous")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Review 1 Transactions" }),
    ).toHaveProperty("disabled", true);

    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      within(desktopTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );

    await waitFor(() => {
      expect(
        within(desktopTable).queryByText("Multiple categories matched"),
      ).toBeNull();
    });
    expect(within(desktopTable).getByText("Housing")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Review 1 Transactions" }),
    ).toHaveProperty("disabled", false);
  });

  it("keeps ambiguous rows in the Unmapped filter", () => {
    render(
      <CategorizeHarness
        initialTransactions={[
          ambiguousTransaction,
          {
            ...ambiguousTransaction,
            id: "transaction-2",
            description: "Rent payment",
            categoryId: "42",
            assignment: "rule",
            matchedCategoryIds: [],
          },
        ]}
      />,
    );

    const desktopTable = getDesktopTable();
    expect(screen.getAllByText("2 of 2 Transactions")).toHaveLength(2);
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(screen.getByRole("option", { name: "Unmapped" }));

    expect(within(desktopTable).getByText("Green Market Cafe")).toBeTruthy();
    expect(within(desktopTable).queryByText("Rent payment")).toBeNull();
    expect(screen.getAllByText("1 of 2 Transactions")).toHaveLength(2);
  });

  it("places the desktop remember control above its Category Rule fields", () => {
    render(<CategorizeHarness />);

    const desktopTable = getDesktopTable();
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const rememberCheckbox = within(desktopTable).getByRole("checkbox", {
      name: "Remember this category",
    });
    const categorySelect = within(desktopTable).getByRole("combobox", {
      name: "Category for Green Market Cafe",
    });
    expect(
      categorySelect.compareDocumentPosition(rememberCheckbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(rememberCheckbox.parentElement?.className.split(/\s+/u)).toContain(
      "justify-end",
    );
    expect(rememberCheckbox.closest("tr")?.className.split(/\s+/u)).toContain(
      "!border-b",
    );

    fireEvent.click(rememberCheckbox);

    expect(rememberCheckbox.closest("tr")?.className.split(/\s+/u)).toContain(
      "border-b-0",
    );

    const patternInput = within(desktopTable).getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    expect(
      rememberCheckbox.compareDocumentPosition(patternInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the proposed pattern in sync until the User edits it directly", () => {
    render(<CategorizeHarness />);

    const desktopTable = getDesktopTable();
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Remember this category",
      }),
    );

    const descriptionInput = within(desktopTable).getByRole("textbox", {
      name: "Description for Green Market Cafe",
    });
    const patternInput = screen.getByRole("textbox", {
      name: "Pattern for Green Market Cafe",
    });
    expect(patternInput).toHaveProperty("value", "Green Market Cafe");

    fireEvent.change(descriptionInput, {
      target: { value: "  Corrected   Merchant  " },
    });
    expect(patternInput).toHaveProperty("value", "Corrected Merchant");

    fireEvent.change(patternInput, { target: { value: "Merchant" } });
    fireEvent.change(descriptionInput, {
      target: { value: "A different description" },
    });
    expect(patternInput).toHaveProperty("value", "Merchant");
  });

  it("keeps the edit open when remembering an Exact Rule fails", async () => {
    const rememberCategoryRule = vi.fn(async () => {
      throw new Error("Rule service unavailable.");
    });

    render(<CategorizeHarness onRememberCategoryRule={rememberCategoryRule} />);

    const desktopTable = getDesktopTable();
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    fireEvent.click(
      within(desktopTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Remember this category",
      }),
    );
    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Exact" }));
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );

    expect(await screen.findByText("Rule service unavailable.")).toBeTruthy();
    expect(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("checkbox", {
          name: "Remember this category",
        })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("combobox", {
        name: "Match type for Green Market Cafe",
      }).textContent,
    ).toContain("Exact");
    expect(
      screen.getByRole("button", { name: "Review 1 Transactions" }),
    ).toHaveProperty("disabled", true);
  });
});

describe("CategorizeStatement E-Wallet controls", () => {
  it("shows the complete document period and original Total Debit in both summaries", () => {
    render(
      <CategorizeHarness
        statementSummary={{
          ...summary,
          statementType: "e_wallet",
          statementDate: new Date("2026-09-07T00:00:00.000Z"),
          provider: "GCash",
          accountType: "E-Wallet",
          transactionHistoryStartDate: new Date("2026-08-09T00:00:00.000Z"),
          totalDebit: 26696.92,
          totalAmountDue: 26696.92,
          totalExtractedAmount: -25291.92,
        }}
        initialTransactions={[
          ambiguousTransaction,
          {
            ...ambiguousTransaction,
            id: "excluded-transaction",
            description: "Received transfer",
            amount: 10,
            isExcluded: true,
          },
        ]}
      />,
    );

    const summaries = screen.getAllByRole("region", {
      name: "Parsed statement summary",
    });
    expect(summaries).toHaveLength(2);
    for (const summaryRegion of summaries) {
      expect(
        within(summaryRegion).getByText("Transaction History Period"),
      ).toBeTruthy();
      expect(summaryRegion.textContent).toContain("E-Wallet");
      expect(summaryRegion.textContent).toContain(
        "Aug 09, 2026 – Sep 07, 2026",
      );
      expect(summaryRegion.textContent).toContain("₱26,696.92");
      expect(within(summaryRegion).queryByText("Statement Amount")).toBeNull();
    }
  });
});

describe("CategorizeStatement row emphasis", () => {
  it("mutes debits, labels them, and leaves credits visually active without a badge", () => {
    const debitTransaction = {
      ...ambiguousTransaction,
      id: "transaction-2",
      description: "Payment received",
      amount: 10,
      isExcluded: true,
    };

    render(
      <CategorizeHarness
        initialTransactions={[ambiguousTransaction, debitTransaction]}
      />,
    );

    const desktopTable = getDesktopTable();
    const creditRow = within(desktopTable)
      .getByText("Green Market Cafe")
      .closest("tr");
    const debitRow = within(desktopTable)
      .getByText("Payment received")
      .closest("tr");

    const hasClass = (element: Element | null, className: string) =>
      element?.className.split(/\s+/u).includes(className) ?? false;

    expect(hasClass(creditRow, "bg-muted/70")).toBe(false);
    expect(hasClass(creditRow, "text-muted-foreground")).toBe(false);
    expect(within(creditRow as HTMLElement).queryByText("Credit")).toBeNull();
    expect(hasClass(debitRow, "bg-muted/70")).toBe(true);
    expect(hasClass(debitRow, "text-muted-foreground")).toBe(true);
    expect(within(debitRow as HTMLElement).getByText("Debit")).toBeTruthy();
  });

  it("mutes manually excluded transactions regardless of amount sign", () => {
    const excludedTransaction = {
      ...ambiguousTransaction,
      id: "transaction-3",
      description: "Excluded refund",
      amount: -10,
      categoryId: "42",
      assignment: "manual" as const,
      matchedCategoryIds: [],
      isExcluded: true,
    };

    render(
      <CategorizeHarness
        initialTransactions={[ambiguousTransaction, excludedTransaction]}
      />,
    );

    const desktopTable = getDesktopTable();
    const excludedRow = within(desktopTable)
      .getByText("Excluded refund")
      .closest("tr");
    const mobileList = screen.getByRole("list", {
      name: "Transactions to categorize",
    });
    const excludedItem = within(mobileList)
      .getByText("Excluded refund")
      .closest("li");

    const hasClass = (element: Element | null, className: string) =>
      element?.className.split(/\s+/u).includes(className) ?? false;

    expect(hasClass(excludedRow, "bg-muted/70")).toBe(true);
    expect(hasClass(excludedRow, "text-muted-foreground")).toBe(true);
    expect(hasClass(excludedItem, "bg-muted/70")).toBe(true);
    expect(hasClass(excludedItem, "text-muted-foreground")).toBe(true);
  });
});
