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
  CategorizedStatementEntry,
} from "./statement-categorizer";

const summary: CategorizedStatement["summary"] = {
  statementType: "credit_card",
  statementDate: new Date("2026-08-31T00:00:00.000Z"),
  provider: "BDO",
  accountType: "AMEX",
  transactionHistoryStartDate: null,
  totalDebit: null,
  entryCount: 1,
  totalAmountDue: 25.5,
  totalExtractedAmount: -25.5,
};

const ambiguousExpense: CategorizedStatementEntry = {
  id: "expense-1",
  entryDate: new Date("2026-08-29T00:00:00.000Z"),
  postingDate: new Date("2026-08-30T00:00:00.000Z"),
  description: "Green Market Cafe",
  amount: -25.5,
  categoryId: null,
  assignment: "ambiguous",
  matchedCategoryIds: ["42", "43"],
  isExcluded: false,
};

const unmappedExpense: CategorizedStatementEntry = {
  ...ambiguousExpense,
  assignment: "unmapped",
  matchedCategoryIds: [],
};

const noSuggestionExpense: CategorizedStatementEntry = {
  ...unmappedExpense,
  id: "expense-no-suggestions",
  description: "No suggestion Cafe",
};

async function getSuggestionsForGreenMarket(description: string) {
  return description === "Green Market Cafe"
    ? [{ categoryId: "43", categoryName: "Groceries" }]
    : null;
}

const categoryRules: readonly CategoryRule[] = [
  { id: "1", categoryId: "42", pattern: "Green", matchType: "contains" },
  { id: "2", categoryId: "43", pattern: "Market", matchType: "contains" },
];

it("offers an unchecked Exact Rule, previews matches, and recovers without remembering", async () => {
  const remember = vi.fn(async () => { throw new Error("Connection lost"); });
  render(<CategorizeHarness onRememberCategoryRule={remember} />);
  const table = getDesktopTable();
  fireEvent.click(within(table).getByRole("button", { name: "Edit Green Market Cafe" }));
  const checkbox = within(table).getByRole("checkbox", { name: "Remember this category" });
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(within(table).getByRole("combobox", { name: "Category for Green Market Cafe" }));
  fireEvent.click(screen.getByRole("option", { name: "Housing" }));
  fireEvent.click(checkbox);
  expect(within(table).getByRole("combobox", { name: "Match type for Green Market Cafe" }).textContent).toContain("Exact");
  expect(within(table).getByText("1 matching row in this statement")).toBeTruthy();
  fireEvent.click(within(table).getByRole("button", { name: "Apply & remember" }));
  expect(await screen.findByText(/The save may have completed/)).toBeTruthy();
  expect(within(table).getByRole("button", { name: "Retry" })).toBeTruthy();
  fireEvent.click(within(table).getByRole("button", { name: "Apply without remembering" }));
  await waitFor(() => expect(within(table).queryByRole("checkbox", { name: "Remember this category" })).toBeNull());
  expect(remember).toHaveBeenCalledTimes(1);
  expect(within(table).getByText("Housing")).toBeTruthy();
});

type RememberCategoryRuleHandler = (
  input: RememberCategoryRuleInput,
  existingRules: readonly CategoryRule[],
) => Promise<RememberCategoryRuleResult>;

interface CategorizeHarnessProps {
  readonly initialExpenses?: CategorizedStatementEntry[];
  readonly getCategorySuggestion?: CategorySuggestionFetcher;
  readonly onRememberCategoryRule?: RememberCategoryRuleHandler;
  readonly onReview?: () => void;
  readonly resetImport?: boolean;
  readonly spaceId?: string;
  readonly categoryDescription?: string;
  readonly statementSummary?: CategorizedStatement["summary"];
}

function CategorizeHarness({
  initialExpenses = [ambiguousExpense],
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
      expenseCount: 1,
      importedByUserId: "10",
    }),
  });
  const initialStatementRef = useRef({
    summary: statementSummary,
    entries: initialExpenses,
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
    name: "Statement Entries parsed from statement.pdf",
  });
}

it("previews normalized repeats and permits deselection and explicit replacement without remembering", () => {
  const remember = vi.fn();
  render(<CategorizeHarness onRememberCategoryRule={remember} initialExpenses={[
    unmappedExpense,
    { ...unmappedExpense, id: "repeat", description: " GREEN  market cafe ", entryDate: new Date("2026-08-28T00:00:00Z") },
    { ...unmappedExpense, id: "reviewed", categoryId: "42", assignment: "manual" },
    { ...unmappedExpense, id: "excluded", isExcluded: true },
    { ...unmappedExpense, id: "punctuation", description: "Green Market Cafe!" },
    { ...ambiguousExpense, id: "ambiguous-repeat" },
  ]} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Categorize repeats of Green Market Cafe" })[0]);
  const preview = screen.getByRole("dialog", { name: "Categorize repeated descriptions" });
  expect(within(preview).getByRole("status").textContent).toBe("2 of 5 matching rows selected");
  const boxes = within(preview).getAllByRole("checkbox");
  expect(boxes[3].hasAttribute("disabled")).toBe(true);
  expect(boxes[4].getAttribute("aria-checked")).toBe("false");
  fireEvent.click(boxes[1]);
  fireEvent.click(boxes[0]);
  expect(within(preview).getByRole("button", { name: "Apply to 0 expenses" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(boxes[0]);
  fireEvent.click(boxes[2]);
  fireEvent.click(within(preview).getByRole("combobox", { name: "Category for selected expenses" }));
  fireEvent.click(screen.getByRole("option", { name: "Groceries" }));
  fireEvent.click(within(preview).getByRole("button", { name: "Apply to 2 expenses" }));
  expect(screen.queryByRole("dialog", { name: "Categorize repeated descriptions" })).toBeNull();
  expect(remember).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "Categorize repeats of Green Market Cafe" })[0]);
  const reopened = screen.getByRole("dialog", { name: "Categorize repeated descriptions" });
  expect(within(reopened).getByRole("status").textContent).toBe("1 of 5 matching rows selected");
  expect(within(reopened).getAllByText("Replace Groceries")).toHaveLength(2);
});

describe("CategorizeStatement ambiguity handling", () => {
  it("prepares suggestions in the background once per normalized description", async () => {
    const getCategorySuggestion = vi.fn(() => new Promise<null>(() => {}));
    render(
      <CategorizeHarness
        initialExpenses={[
          unmappedExpense,
          {
            ...unmappedExpense,
            id: "expense-2",
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
        initialExpenses={[
          "Market One",
          "Market Two",
          "Market Three",
          "Market Four",
        ].map((description, index) => ({
          ...unmappedExpense,
          id: `expense-${index + 1}`,
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

  it("does not show a late result after the edited Expense description changes", async () => {
    const originalResult = createDeferred<readonly CategorySuggestion[] | null>();
    const editedResult = createDeferred<readonly CategorySuggestion[] | null>();
    const getCategorySuggestion = vi.fn((description: string) =>
      description === "Green Market Cafe"
        ? originalResult.promise
        : editedResult.promise,
    );
    render(
      <CategorizeHarness
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });
    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });
    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });

    view.rerender(
      <CategorizeHarness
        initialExpenses={[unmappedExpense]}
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
        initialExpenses={[unmappedExpense]}
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

  it("cancels obsolete suggestion work when a Statement Entry is excluded", async () => {
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
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
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );
    await waitFor(() => {
      expect(getCategorySuggestion).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <CategorizeHarness
        initialExpenses={[unmappedExpense]}
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
        onRememberCategoryRule={rememberCategoryRule}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
      name: "Edit Statement Entry",
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

  it("shows suggestions in the mobile Category control only for included Unmapped rows", async () => {
    const getCategorySuggestion = vi.fn(getSuggestionsForGreenMarket);
    const excludedExpense = {
      ...unmappedExpense,
      id: "expense-excluded",
      description: "Excluded Cafe",
      isExcluded: true,
    };
    const categorizedExpense = {
      ...unmappedExpense,
      id: "expense-categorized",
      description: "Already categorized Cafe",
      categoryId: "42",
      assignment: "manual" as const,
    };
    render(
      <CategorizeHarness
        initialExpenses={[
          unmappedExpense,
          noSuggestionExpense,
          excludedExpense,
          categorizedExpense,
        ]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    const categoryControl = await within(mobileList).findByRole("button", {
      name: "Edit Category for Green Market Cafe, 1 suggestion available",
    });
    expect(categoryControl.textContent).toContain("1 suggestion");
    for (const description of [
      "No suggestion Cafe",
      "Excluded Cafe",
      "Already categorized Cafe",
    ]) {
      expect(
        within(mobileList).queryByRole("button", {
          name: new RegExp(`Edit Category for ${description}, .* suggestions? available`),
        }),
      ).toBeNull();
    }

    fireEvent.click(categoryControl);

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
    expect(within(editor).getByRole("combobox", { name: "Category for Green Market Cafe" })).toBe(
      document.activeElement,
    );
    expect(
      await within(editor).findByRole("button", {
        name: "Use suggested Category: Groceries",
      }),
    ).toBeTruthy();
  });

  it("shows an accessible desktop Suggestions available cue that opens the Category editor", async () => {
    const getCategorySuggestion = vi.fn(getSuggestionsForGreenMarket);
    render(
      <CategorizeHarness
        initialExpenses={[unmappedExpense, noSuggestionExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const expenseTable = getDesktopTable();
    const cue = await within(expenseTable).findByRole("button", {
      name: "Suggestions available for Green Market Cafe",
    });
    expect(cue.textContent).toContain("Suggestions available");
    expect(
      within(expenseTable).queryByRole("button", {
        name: "Suggestions available for No suggestion Cafe",
      }),
    ).toBeNull();

    fireEvent.click(cue);

    const dateInput = within(expenseTable).getByLabelText(
      "Date for Green Market Cafe",
    );
    expect(document.activeElement).toBe(dateInput);
    const suggestionGroup = await within(expenseTable).findByRole("group", {
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const expenseTable = getDesktopTable();
    fireEvent.click(
      within(expenseTable).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const suggestion = await within(expenseTable).findByRole("button", {
      name: "Use suggested Category: Housing",
    });
    const suggestionGroup = within(expenseTable).getByRole("group", {
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
      within(expenseTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }),
    ).toBeTruthy();
    fireEvent.click(suggestion);
    expect(
      within(expenseTable).getByRole("combobox", {
        name: "Category for Green Market Cafe",
      }).textContent,
    ).toContain("Housing");
  });

  it("shows nonblocking loading feedback while checking for a suggestion", async () => {
    const getCategorySuggestion = vi.fn(() => new Promise<null>(() => {}));
    render(
      <CategorizeHarness
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
        initialExpenses={[unmappedExpense]}
        getCategorySuggestion={getCategorySuggestion}
        onReview={onReview}
      />,
    );

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
      name: "Review 1 Expenses",
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
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    expect(getCategorySuggestion).not.toHaveBeenCalled();
    expect(
      within(
        screen.getByRole("dialog", { name: "Edit Statement Entry" }),
      ).getByRole("combobox", { name: "Category for Green Market Cafe" }),
    ).toBeTruthy();
  });

  it("uses the saved Category Color for an assigned Expense", () => {
    render(
      <CategorizeHarness
        initialExpenses={[
          {
            ...ambiguousExpense,
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

  it("offers the mobile Expense flow alongside the desktop table", () => {
    render(<CategorizeHarness />);

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    const desktopTable = screen.getByRole("table", {
      name: "Statement Entries parsed from statement.pdf",
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
    const unmappedExpense = {
      ...ambiguousExpense,
      description: "Unmapped Cafe",
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };

    render(<CategorizeHarness initialExpenses={[unmappedExpense]} />);

    const mobileItem = within(
      screen.getByRole("list", { name: "Statement Entries to categorize" }),
    )
      .getByText("Unmapped Cafe")
      .closest("li");
    const desktopRow = within(getDesktopTable())
      .getByText("Unmapped Cafe")
      .closest("tr");

    expect(
      mobileItem && within(mobileItem).getAllByText("Unmapped"),
    ).toHaveLength(1);
    expect(mobileItem && within(mobileItem).getByText("Choose category")).toBeTruthy();
    expect(
      desktopRow && within(desktopRow).getAllByText("Unmapped"),
    ).toHaveLength(1);
    expect(
      desktopRow && within(desktopRow).getAllByRole("cell")[4]?.textContent,
    ).toBe("");
  });

  it("explicitly applies compact assignments and skips excluded rows", async () => {
    render(<CategorizeHarness initialExpenses={[
      unmappedExpense,
      { ...unmappedExpense, id: "excluded", description: "Excluded Cafe", isExcluded: true },
      { ...unmappedExpense, id: "assigned", description: "Assigned Cafe", categoryId: "42", assignment: "manual" },
      { ...unmappedExpense, id: "next", description: "Next Cafe" },
    ]} getCategorySuggestion={getSuggestionsForGreenMarket} />);
    const list = screen.getByRole("list", { name: "Statement Entries to categorize" });
    fireEvent.click(within(list).getByRole("button", { name: "Edit Category for Green Market Cafe" }));
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
    expect(within(editor).queryByRole("textbox", { name: "Description for Green Market Cafe" })).toBeNull();
    fireEvent.click(await within(editor).findByRole("button", { name: "Use suggested Category: Groceries" }));
    expect(within(list).getAllByText("Unmapped").length).toBeGreaterThan(0);
    fireEvent.click(within(editor).getByRole("button", { name: "Apply & next" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Category for Next Cafe" })).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Category for Next Cafe" }));
    fireEvent.click(screen.getByRole("button", { name: "Full corrections" }));
    expect(screen.getByRole("textbox", { name: "Description for Next Cafe" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Description for Next Cafe" }), { target: { value: "Corrected Cafe" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Category for Next Cafe" }));
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply & next" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("All included expenses have a Category. Continue to Review when ready.")).toBeTruthy();
    expect(within(list).getByText("Corrected Cafe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review 3 Expenses" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(within(list).getByRole("button", { name: "Include Excluded Cafe" }));
    expect(screen.getByRole("button", { name: "Review 4 Expenses" }).hasAttribute("disabled")).toBe(true);
  });

  it("retains corrections and editor position when Apply & next fails", async () => {
    render(<CategorizeHarness initialExpenses={[unmappedExpense, { ...unmappedExpense, id: "next", description: "Next Cafe" }]}
      onRememberCategoryRule={async () => { throw new Error("Rule unavailable"); }} />);
    const list = screen.getByRole("list", { name: "Statement Entries to categorize" });
    fireEvent.click(within(list).getByRole("button", { name: "Edit Category for Green Market Cafe" }));
    const editor = screen.getByRole("dialog");
    fireEvent.click(within(editor).getByRole("button", { name: "Full corrections" }));
    fireEvent.change(within(editor).getByRole("textbox", { name: "Description for Green Market Cafe" }), { target: { value: "Corrected Cafe" } });
    fireEvent.change(within(editor).getByLabelText("Amount for Green Market Cafe"), { target: { value: "-30" } });
    fireEvent.click(within(editor).getByRole("combobox", { name: "Category for Green Market Cafe" }));
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(within(editor).getByRole("checkbox", { name: "Remember this category" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Apply & next" }));
    expect(await screen.findByText("Rule unavailable")).toBeTruthy();
    const recoveredEditor = screen.getByRole("dialog");
    expect(within(recoveredEditor).getByRole("textbox", { name: "Description for Green Market Cafe" }).getAttribute("value")).toBe("Corrected Cafe");
    expect(within(recoveredEditor).getByLabelText("Amount for Green Market Cafe").getAttribute("value")).toBe("-30");
    expect(within(list).getByText("Green Market Cafe")).toBeTruthy();
    expect(within(recoveredEditor).queryByRole("combobox", { name: "Category for Next Cafe" })).toBeNull();
  });

  it("focuses the Category selector when Choose category opens the mobile editor", () => {
    render(<CategorizeHarness initialExpenses={[unmappedExpense]} />);

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Category for Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
    const categoryInput = within(editor).getByRole("combobox", {
      name: "Category for Green Market Cafe",
    });
    expect(document.activeElement).toBe(categoryInput);
  });

  it("does not mark the Sheet filters active for inline search", () => {
    render(<CategorizeHarness />);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search Statement Entries" }),
      {
        target: { value: "green" },
      },
    );

    expect(
      screen.getByRole("button", { name: "Filter Statement Entries" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Filter Statement Entries, filters active",
      }),
    ).toBeNull();
  });

  it("does not auto-focus the mobile From date filter when opened", () => {
    render(<CategorizeHarness />);

    fireEvent.click(
      screen.getByRole("button", { name: "Filter Statement Entries" }),
    );

    const filters = screen.getByRole("dialog", { name: "Filter Statement Entries" });
    const fromInput = within(filters).getByLabelText("From");

    expect(document.activeElement).not.toBe(fromInput);
  });

  it("edits a Statement Entry from the mobile editor", async () => {
    render(<CategorizeHarness />);

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
        screen.queryByRole("dialog", { name: "Edit Statement Entry" }),
      ).toBeNull();
    });
    expect(within(mobileList).getByText("Housing")).toBeTruthy();
  });

  it("uses the Expense description for Exact Rules and only enables Contains patterns", () => {
    render(<CategorizeHarness />);

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );

    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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

    expect(matchType.textContent).toContain("Exact");
    expect(pattern).toHaveProperty("disabled", true);
    fireEvent.click(matchType);
    fireEvent.click(screen.getByRole("option", { name: "Contains" }));
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
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
    fireEvent.click(within(editor).getByRole("combobox", { name: "Match type for Green Market Cafe" }));
    fireEvent.click(screen.getByRole("option", { name: "Contains" }));
    fireEvent.change(
      within(editor).getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
      { target: { value: "  Cafe  " } },
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Apply & remember" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Edit Statement Entry" }),
      ).toBeNull();
    });
    expect(rememberCategoryRule).toHaveBeenCalledWith(
      { pattern: "CAFE", categoryId: "42", matchType: "contains" },
      categoryRules,
    );
    expect(screen.getByRole("status").textContent).toContain("Category Rule saved for future imports");

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
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
      within(editor).getByRole("button", { name: "Apply & remember" }),
    );

    expect(await screen.findByText("Rule service unavailable.")).toBeTruthy();
    const recoveredEditor = screen.getByRole("dialog", {
      name: "Edit Statement Entry",
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
      name: "Statement Entries to categorize",
    });
    fireEvent.click(
      within(mobileList).getByRole("button", {
        name: "Edit Green Market Cafe",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Edit Statement Entry" });
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
      within(editor).getByRole("button", { name: "Apply & remember" }),
    );

    expect(
      await screen.findByText("A Category Rule requires a non-empty pattern."),
    ).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "Edit Statement Entry" }),
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
        initialExpenses={[
          ambiguousExpense,
          {
            ...ambiguousExpense,
            id: "expense-2",
            description: "Rent payment",
            categoryId: "42",
            assignment: "rule",
            matchedCategoryIds: [],
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Filter Statement Entries" }),
    );
    const filters = screen.getByRole("dialog", { name: "Filter Statement Entries" });
    fireEvent.click(
      within(filters).getByRole("combobox", { name: "Category" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Unmapped" }));
    fireEvent.click(
      within(filters).getByRole("button", { name: "Close navigation" }),
    );

    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
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
      screen.getByRole("button", { name: "Review 1 Expenses" }),
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
      screen.getByRole("button", { name: "Review 1 Expenses" }),
    ).toHaveProperty("disabled", false);
  });

  it("keeps ambiguous rows in the Unmapped filter", () => {
    render(
      <CategorizeHarness
        initialExpenses={[
          ambiguousExpense,
          {
            ...ambiguousExpense,
            id: "expense-2",
            description: "Rent payment",
            categoryId: "42",
            assignment: "rule",
            matchedCategoryIds: [],
          },
        ]}
      />,
    );

    const desktopTable = getDesktopTable();
    expect(screen.getAllByText("2 of 2 Expenses")).toHaveLength(2);
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(screen.getByRole("option", { name: "Unmapped" }));

    expect(within(desktopTable).getByText("Green Market Cafe")).toBeTruthy();
    expect(within(desktopTable).queryByText("Rent payment")).toBeNull();
    expect(screen.getAllByText("1 of 2 Expenses")).toHaveLength(2);
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

    fireEvent.click(screen.getByRole("combobox", { name: "Match type for Green Market Cafe" }));
    fireEvent.click(screen.getByRole("option", { name: "Contains" }));
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
      screen.getByRole("button", { name: "Review 1 Expenses" }),
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
        initialExpenses={[
          ambiguousExpense,
          {
            ...ambiguousExpense,
            id: "excluded-expense",
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
  it("labels excluded payments accurately and displays positive expense amounts", () => {
    const debitExpense = {
      ...ambiguousExpense,
      id: "expense-2",
      description: "Payment received",
      activityKind: "payment" as const,
      amount: 10,
      isExcluded: true,
    };

    render(
      <CategorizeHarness
        initialExpenses={[ambiguousExpense, debitExpense]}
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
    expect(within(creditRow as HTMLElement).getByText("₱25.50")).toBeTruthy();
    expect(hasClass(debitRow, "bg-muted/70")).toBe(true);
    expect(hasClass(debitRow, "text-muted-foreground")).toBe(true);
    expect(within(debitRow as HTMLElement).getByText("Payment")).toBeTruthy();
  });

  it("mutes manually excluded expenses regardless of amount sign", () => {
    const excludedExpense = {
      ...ambiguousExpense,
      id: "expense-3",
      description: "Excluded refund",
      amount: -10,
      categoryId: "42",
      assignment: "manual" as const,
      matchedCategoryIds: [],
      isExcluded: true,
    };

    render(
      <CategorizeHarness
        initialExpenses={[ambiguousExpense, excludedExpense]}
      />,
    );

    const desktopTable = getDesktopTable();
    const excludedRow = within(desktopTable)
      .getByText("Excluded refund")
      .closest("tr");
    const mobileList = screen.getByRole("list", {
      name: "Statement Entries to categorize",
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
