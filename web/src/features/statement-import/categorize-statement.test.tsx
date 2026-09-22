// @vitest-environment jsdom

import { useEffect, useRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CategorizeStatementAdapter,
} from "./statement-import-workflow-adapter";
import { useStatementImportWorkflow } from "./use-statement-import-workflow";
import type {
  CategoryRule,
  RememberCategoryRuleInput,
  RememberCategoryRuleResult,
} from "./statement-import-service";
import type {
  CategorizedStatement,
  CategorizedTransaction,
} from "./statement-categorizer";

const summary: CategorizedStatement["summary"] = {
  statementDate: new Date("2026-08-31T00:00:00.000Z"),
  provider: "BDO",
  accountType: "AMEX",
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
  readonly onRememberCategoryRule?: RememberCategoryRuleHandler;
}

function CategorizeHarness({
  initialTransactions = [ambiguousTransaction],
  onRememberCategoryRule = async () => ({
    status: "created" as const,
    rule: {
      id: "7",
      categoryId: "42",
      pattern: "GREEN MARKET",
      matchType: "contains" as const,
    },
  }),
}: CategorizeHarnessProps) {
  const { workflow } = useStatementImportWorkflow({
    categoryOptions: [
      { value: "42", label: "Housing", color: "teal" },
      { value: "43", label: "Groceries", color: "forest" },
    ],
    categoryLabels: [
      { value: "42", label: "Housing", color: "teal", isActive: true },
      { value: "43", label: "Groceries", color: "forest", isActive: true },
    ],
    onRememberCategoryRule,
    onCommitStatementImport: async () => ({
      id: "import-1",
      fileName: "statement.pdf",
      statementDate: "2026-08-31",
      provider: "BDO",
      accountType: "AMEX",
      importedAt: "2026-09-01T00:00:00.000Z",
      transactionCount: 1,
      importedByUserId: "10",
    }),
  });
  const initialStatementRef = useRef({
    summary,
    transactions: initialTransactions,
  });

  useEffect(() => {
    workflow.acceptPreparedStatement(
      new File(["statement"], "statement.pdf", { type: "application/pdf" }),
      initialStatementRef.current,
      categoryRules,
    );
  }, [workflow]);

  return (
    <CategorizeStatementAdapter
      workflow={workflow}
      categoryOptions={[
        { value: "42", label: "Housing", color: "teal" },
        { value: "43", label: "Groceries", color: "forest" },
      ]}
      categoryLabels={[
        { value: "42", label: "Housing", color: "teal", isActive: true },
        { value: "43", label: "Groceries", color: "forest", isActive: true },
      ]}
      currentCategoryRules={categoryRules}
      fileName="statement.pdf"
      statementSummary={summary}
      onBack={vi.fn()}
      onReview={vi.fn()}
    />
  );
}

afterEach(() => cleanup());

function getDesktopTable() {
  return screen.getByRole("table", {
    name: "Transactions parsed from statement.pdf",
  });
}

describe("CategorizeStatement ambiguity handling", () => {
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

    render(
      <CategorizeHarness initialTransactions={[unmappedTransaction]} />,
    );

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

  it("aligns mobile transaction actions to the right", () => {
    render(<CategorizeHarness />);

    const mobileItem = within(
      screen.getByRole("list", { name: "Transactions to categorize" }),
    )
      .getByText("Green Market Cafe")
      .closest("li");
    const editButton = within(mobileItem as HTMLElement).getByRole("button", {
      name: "Edit Green Market Cafe",
    });

    expect(editButton.parentElement?.className.split(/\s+/u)).toContain(
      "ml-auto",
    );
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

  it("keeps the mobile date field inside the editor width", () => {
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

    expect(dateInput.className.split(/\s+/u)).toContain("max-w-full");
    expect(dateInput.parentElement?.className.split(/\s+/u)).toContain(
      "min-w-0",
    );
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

  it("persists a mobile Contains Rule without rewriting other reviewed Transactions", async () => {
    const sameCategoryTransaction = {
      ...ambiguousTransaction,
      id: "transaction-2",
      description: "Green Cafe",
      categoryId: null,
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };
    const crossCategoryTransaction = {
      ...ambiguousTransaction,
      id: "transaction-3",
      description: "Market Cafe",
      categoryId: null,
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };
    const excludedTransaction = {
      ...ambiguousTransaction,
      id: "transaction-4",
      description: "Cafe refund",
      amount: 5,
      categoryId: "43",
      assignment: "manual" as const,
      matchedCategoryIds: [],
      isExcluded: true,
    };
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

    render(
      <CategorizeHarness
        initialTransactions={[
          ambiguousTransaction,
          sameCategoryTransaction,
          crossCategoryTransaction,
          excludedTransaction,
        ]}
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
    const sameCategoryItem = within(mobileList)
      .getByText("Green Cafe")
      .closest("li");
    const crossCategoryItem = within(mobileList)
      .getByText("Market Cafe")
      .closest("li");
    const excludedItem = within(mobileList)
      .getByText("Cafe refund")
      .closest("li");

    expect(directItem && within(directItem).getByText("Housing")).toBeTruthy();
    expect(directItem && within(directItem).getByText("Manual")).toBeTruthy();
    expect(
      sameCategoryItem && within(sameCategoryItem).getByText("Unmapped"),
    ).toBeTruthy();
    expect(
      crossCategoryItem && within(crossCategoryItem).getByText("Unmapped"),
    ).toBeTruthy();
    expect(
      excludedItem && within(excludedItem).getByText("Groceries"),
    ).toBeTruthy();
    expect(
      excludedItem && within(excludedItem).getByText("Excluded"),
    ).toBeTruthy();
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
    expect(
      rememberCheckbox.closest("tr")?.className.split(/\s+/u),
    ).toContain("!border-b");

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

  it("remembers a Contains Rule without rewriting other included Transactions", async () => {
    const sameCategoryTransaction = {
      ...ambiguousTransaction,
      id: "transaction-2",
      description: "Green Cafe",
      categoryId: null,
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };
    const crossCategoryTransaction = {
      ...ambiguousTransaction,
      id: "transaction-3",
      description: "Market Cafe",
      categoryId: null,
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };
    const excludedTransaction = {
      ...ambiguousTransaction,
      id: "transaction-4",
      description: "Cafe refund",
      amount: 5,
      categoryId: "43",
      assignment: "manual" as const,
      matchedCategoryIds: [],
      isExcluded: true,
    };
    const rememberCategoryRule = vi.fn(async () => ({
      status: "created" as const,
      rule: {
        id: "7",
        categoryId: "42",
        pattern: "Cafe",
        matchType: "contains" as const,
      },
    }));

    render(
      <CategorizeHarness
        initialTransactions={[
          ambiguousTransaction,
          sameCategoryTransaction,
          crossCategoryTransaction,
          excludedTransaction,
        ]}
        onRememberCategoryRule={rememberCategoryRule}
      />,
    );

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
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Pattern for Green Market Cafe",
      }),
      { target: { value: "Cafe" } },
    );
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Green Market Cafe",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Review 3 Transactions" }),
      ).toHaveProperty("disabled", true);
    });
    expect(rememberCategoryRule).toHaveBeenCalledWith(
      { pattern: "CAFE", categoryId: "42", matchType: "contains" },
      categoryRules,
    );

    const directRow = within(desktopTable)
      .getByText("Green Market Cafe")
      .closest("tr");
    const sameCategoryRow = within(desktopTable)
      .getByText("Green Cafe")
      .closest("tr");
    const excludedRow = within(desktopTable)
      .getByText("Cafe refund")
      .closest("tr");

    expect(directRow && within(directRow).getByText("Housing")).toBeTruthy();
    expect(
      sameCategoryRow && within(sameCategoryRow).getByText("Unmapped"),
    ).toBeTruthy();
    expect(
      excludedRow && within(excludedRow).getByText("Groceries"),
    ).toBeTruthy();
    expect(
      excludedRow && within(excludedRow).getByText("Excluded"),
    ).toBeTruthy();
  });

  it("keeps prior manual assignments when remembering a Category Rule", async () => {
    const firstTransaction = {
      ...ambiguousTransaction,
      description: "First unmapped merchant",
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };
    const secondTransaction = {
      ...ambiguousTransaction,
      id: "transaction-2",
      description: "Second unmapped merchant",
      assignment: "unmapped" as const,
      matchedCategoryIds: [],
    };
    const rememberCategoryRule = vi.fn(async () => ({
      status: "created" as const,
      rule: {
        id: "7",
        categoryId: "43",
        pattern: "SECOND UNMAPPED MERCHANT",
        matchType: "contains" as const,
      },
    }));

    render(
      <CategorizeHarness
        initialTransactions={[firstTransaction, secondTransaction]}
        onRememberCategoryRule={rememberCategoryRule}
      />,
    );

    const desktopTable = getDesktopTable();
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit First unmapped merchant",
      }),
    );
    fireEvent.click(
      within(desktopTable).getByRole("combobox", {
        name: "Category for First unmapped merchant",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Housing" }));
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to First unmapped merchant",
      }),
    );

    await waitFor(() => {
      expect(
        within(desktopTable).queryByRole("button", {
          name: "Save changes to First unmapped merchant",
        }),
      ).toBeNull();
    });

    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Edit Second unmapped merchant",
      }),
    );
    fireEvent.click(
      within(desktopTable).getByRole("combobox", {
        name: "Category for Second unmapped merchant",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Groceries" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Remember this category" }),
    );
    fireEvent.click(
      within(desktopTable).getByRole("button", {
        name: "Save changes to Second unmapped merchant",
      }),
    );

    await waitFor(() => {
      expect(rememberCategoryRule).toHaveBeenCalledOnce();
      expect(
        within(desktopTable).queryByRole("button", {
          name: "Save changes to Second unmapped merchant",
        }),
      ).toBeNull();
    });
    const firstRow = within(desktopTable)
      .getByText("First unmapped merchant")
      .closest("tr");
    expect(firstRow && within(firstRow).getByText("Housing")).toBeTruthy();
  });

  it("keeps repeated and excluded rows unchanged after remembering an Exact Rule", async () => {
    const repeatedTransaction = {
      ...ambiguousTransaction,
      id: "transaction-2",
      description: " green   market   cafe ",
    };
    const excludedRepeatedTransaction = {
      ...ambiguousTransaction,
      id: "transaction-3",
      amount: 5,
      isExcluded: true,
    };
    const rememberCategoryRule = vi.fn(async () => ({
      status: "created" as const,
      rule: {
        id: "7",
        categoryId: "42",
        pattern: "GREEN MARKET CAFE",
        matchType: "exact" as const,
      },
    }));

    render(
      <CategorizeHarness
        initialTransactions={[
          ambiguousTransaction,
          repeatedTransaction,
          excludedRepeatedTransaction,
        ]}
        onRememberCategoryRule={rememberCategoryRule}
      />,
    );

    const desktopTable = getDesktopTable();
    fireEvent.click(
      within(desktopTable).getAllByRole("button", {
        name: "Edit Green Market Cafe",
      })[0],
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

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Review 2 Transactions" }),
      ).toHaveProperty("disabled", true);
    });
    expect(rememberCategoryRule).toHaveBeenCalledWith(
      { pattern: "GREEN MARKET CAFE", categoryId: "42", matchType: "exact" },
      categoryRules,
    );
    const counts = screen.getByText("0 Rule").parentElement;
    expect(counts?.textContent).toContain("1 Manual");
    expect(counts?.textContent).toContain("1 Ambiguous");
    expect(counts?.textContent).toContain("1 Excluded");
    expect(
      screen.getByRole("button", { name: "Review 2 Transactions" }),
    ).toHaveProperty("disabled", true);
    expect(
      within(desktopTable).getAllByLabelText(
        "Multiple categories matched: Housing, Groceries",
      ),
    ).toHaveLength(2);
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
