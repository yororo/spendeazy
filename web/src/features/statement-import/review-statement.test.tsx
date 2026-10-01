// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

import { ReviewStatement } from "./review-statement";
import type {
  CategoryEligibilityConflict,
  ProbableDuplicateConflict,
} from "./statement-import-errors";
import type { CategorizedTransaction } from "./statement-categorizer";

const transaction: CategorizedTransaction = {
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

const statementSummary = {
  statementType: "credit_card" as const,
  statementDate: new Date("2026-08-31T00:00:00.000Z"),
  provider: "BDO",
  accountType: "AMEX",
  transactionHistoryStartDate: null,
  totalDebit: null,
  totalTransactions: 3,
  totalAmountDue: 65.5,
  totalExtractedAmount: 65.5,
};

const eWalletStatementSummary = {
  statementType: "e_wallet" as const,
  statementDate: new Date("2026-09-07T00:00:00.000Z"),
  provider: "GCash",
  accountType: "E-Wallet",
  transactionHistoryStartDate: new Date("2026-08-09T00:00:00.000Z"),
  totalDebit: 26696.92,
  totalTransactions: 3,
  totalAmountDue: 26696.92,
  totalExtractedAmount: -25291.92,
};

const completeTransactions: CategorizedTransaction[] = [
  {
    id: "housing-transaction",
    transactionDate: new Date("2026-08-02T00:00:00.000Z"),
    postingDate: new Date("2026-08-03T00:00:00.000Z"),
    description: "Northline Properties",
    amount: -50,
    categoryId: "42",
    assignment: "rule",
    matchedCategoryIds: ["42"],
    isExcluded: false,
  },
  {
    id: "groceries-transaction",
    transactionDate: new Date("2026-08-04T00:00:00.000Z"),
    postingDate: new Date("2026-08-05T00:00:00.000Z"),
    description: "Green Market Cafe",
    amount: -15.5,
    categoryId: "43",
    assignment: "manual",
    matchedCategoryIds: ["43"],
    isExcluded: false,
  },
  {
    id: "credit-transaction",
    transactionDate: new Date("2026-08-06T00:00:00.000Z"),
    postingDate: new Date("2026-08-07T00:00:00.000Z"),
    description: "Store refund",
    amount: 10,
    categoryId: null,
    assignment: "unmapped",
    matchedCategoryIds: [],
    isExcluded: true,
  },
];

type ReviewProps = ComponentProps<typeof ReviewStatement>;

const defaultProps: ReviewProps = {
  categoryOptions: [
    { value: "42", label: "Housing", color: "teal" },
    { value: "43", label: "Groceries", color: "forest" },
  ],
  fileName: "statement.pdf",
  statementSummary,
  transactions: [transaction],
  commitError: null,
  probableDuplicateConflict: null,
  categoryEligibilityConflict: null,
  canImportAnyway: true,
  canConfirm: true,
  isCommitting: false,
  hasFileDuplicate: false,
  onBack: vi.fn(),
  onCommit: vi.fn(),
};

function renderReview(
  overrides: Partial<ReviewProps> = {},
) {
  const props = { ...defaultProps, ...overrides };
  render(<ReviewStatement {...props} />);
  return props;
}

function expectBefore(left: Element, right: Element) {
  expect(
    Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING),
  ).toBe(true);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReviewStatement ambiguity handling", () => {
  it("uses the saved Category Color in the Category breakdown", () => {
    renderReview({ transactions: completeTransactions });

    const categoryBreakdown = screen.getByRole("region", {
      name: "Category breakdown",
    });
    expect(
      within(categoryBreakdown)
        .getByText("Housing")
        .parentElement?.querySelector('[aria-hidden="true"]')?.className,
    ).toContain("bg-category-teal");
  });

  it("shows candidate Categories and blocks import until the ambiguity is resolved", () => {
    const onBack = vi.fn();

    render(
      <ReviewStatement
        categoryOptions={[
          { value: "42", label: "Housing", color: "teal" },
          { value: "43", label: "Groceries", color: "forest" },
        ]}
        fileName="statement.pdf"
        statementSummary={{
        statementDate: new Date("2026-08-31T00:00:00.000Z"),
        provider: "BDO",
        accountType: "AMEX",
        statementType: "credit_card",
        transactionHistoryStartDate: null,
        totalDebit: null,
          totalTransactions: 1,
          totalAmountDue: 25.5,
          totalExtractedAmount: 25.5,
        }}
        transactions={[transaction]}
        commitError={null}
        probableDuplicateConflict={null}
        categoryEligibilityConflict={null}
        canImportAnyway={true}
        canConfirm={false}
        isCommitting={false}
        hasFileDuplicate={false}
        onBack={onBack}
        onCommit={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Multiple categories matched")).toHaveLength(2);
    expect(screen.getAllByText("Housing, Groceries")).toHaveLength(2);
    expect(
      within(
        screen.getByRole("list", { name: "Transactions to review" }),
      ).getByText("Housing, Groceries"),
    ).toBeTruthy();
    expect(screen.getAllByText(/multiple categories matched/).length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Back to Categorize" }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Import 1 Transactions" }),
    ).toHaveProperty("disabled", true);
  });
});

describe("ReviewStatement phone composition", () => {
  it("keeps the complete summary, status, Category breakdown, and Transaction details in phone order", () => {
    renderReview({
      statementSummary,
      transactions: completeTransactions,
    });

    const summaries = screen.getAllByRole("region", {
      name: "Statement review summary",
    });
    const phoneSummary = summaries[0];
    const readinessStates = screen.getAllByRole("status", {
      name: "Import readiness",
    });
    const phoneStatus = readinessStates[0];
    const categoryBreakdown = screen.getByRole("region", {
      name: "Category breakdown",
    });
    const transactionList = screen.getByRole("list", {
      name: "Transactions to review",
    });

    expect(phoneSummary).toBeTruthy();
    expect(phoneStatus).toBeTruthy();
    expectBefore(phoneSummary, phoneStatus);
    expectBefore(phoneStatus, categoryBreakdown);
    expectBefore(categoryBreakdown, transactionList);

    expect(within(phoneSummary).getByText("BDO")).toBeTruthy();
    expect(within(phoneSummary).getByText(/AMEX/)).toBeTruthy();
    expect(within(phoneSummary).getByText(/\*{4}/)).toBeTruthy();
    expect(within(phoneSummary).getByText(/statement\.pdf/)).toBeTruthy();
    expect(within(phoneSummary).getByText("Aug 31, 2026")).toBeTruthy();
    expect(within(phoneSummary).getByText("₱65.50")).toBeTruthy();
    expect(within(phoneSummary).getByText("2")).toBeTruthy();
    expect(within(phoneSummary).getByText("2 / 2")).toBeTruthy();

    expect(within(categoryBreakdown).getByText("Housing")).toBeTruthy();
    expect(within(categoryBreakdown).getByText("Groceries")).toBeTruthy();
    expect(within(categoryBreakdown).getByText("₱50.00")).toBeTruthy();
    expect(within(categoryBreakdown).getByText("76.3%")).toBeTruthy();
    expect(within(categoryBreakdown).getByText("₱15.50")).toBeTruthy();
    expect(within(categoryBreakdown).getByText("23.7%")).toBeTruthy();

    expect(within(transactionList).getByText("Northline Properties")).toBeTruthy();
    expect(within(transactionList).getByText("Green Market Cafe")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Excluded rows (1)")[0]);
    const exclusions = screen.getByRole("list", { name: "Excluded rows to review" });
    expect(within(exclusions).getByText("Store refund")).toBeTruthy();
    expect(within(transactionList).getByText("Aug 02, 2026")).toBeTruthy();
    expect(within(transactionList).getByText("₱50.00")).toBeTruthy();
    expect(within(transactionList).getByText("₱15.50")).toBeTruthy();
    expect(within(transactionList).getByText("Rule")).toBeTruthy();
    expect(within(transactionList).getByText("Manual")).toBeTruthy();
    expect(within(transactionList).getAllByText("Expense")).toHaveLength(2);
    expect(within(exclusions).getByText("Other credit — not an expense")).toBeTruthy();

    const importButton = screen.getByRole("button", {
      name: "Import 2 Transactions",
    });
    expectBefore(transactionList, importButton);

    const backButtons = screen.getAllByRole("button", {
      name: "Back to Categorize",
    });
    expect(backButtons).toHaveLength(1);
    fireEvent.click(backButtons[0]);
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewStatement E-Wallet controls", () => {
  it("shows the document period and Total Debit separately from included debits", () => {
    renderReview({
      statementSummary: eWalletStatementSummary,
      transactions: completeTransactions,
    });

    const summaries = screen.getAllByRole("region", {
      name: "Statement review summary",
    });
    expect(summaries).toHaveLength(2);
    for (const summary of summaries) {
      expect(within(summary).getByText("Transaction History Period")).toBeTruthy();
      expect(summary.textContent).toContain("E-Wallet");
      expect(summary.textContent).toContain("Aug 09, 2026 – Sep 07, 2026");
      expect(summary.textContent).toContain("₱26,696.92");
      expect(within(summary).queryByText(/\*{4}/u)).toBeNull();
    }

    expect(screen.getByText("Included debits").parentElement?.textContent).toContain(
      "₱65.50",
    );
    expect(
      screen.getByRole("table", {
        name: "Included expenses from statement.pdf",
      }),
    ).toBeTruthy();
  });
});

describe("ReviewStatement import safeguards", () => {
  it("commits a ready review and exposes disabled committing feedback", () => {
    const { onCommit } = renderReview({
      transactions: completeTransactions,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Import 2 Transactions" }),
    );
    expect(onCommit).toHaveBeenCalledWith(false);

    cleanup();
    renderReview({
      transactions: completeTransactions,
      isCommitting: true,
    });

    const importButton = screen.getByRole("button", {
      name: "Import 2 Transactions",
    });
    expect(importButton).toHaveProperty("disabled", true);
    expect(importButton.getAttribute("aria-busy")).toBe("true");
  });

  it("keeps probable duplicate and duplicate-file safeguards visible and blocking", () => {
    const probableDuplicateConflict: ProbableDuplicateConflict = {
      message: "Probable duplicate Transactions found.",
      details: [
        {
          field: "description",
          code: "probable_duplicate",
          message: "Description matched an existing Transaction.",
          transactionIndexes: [0],
          committedTransactionIds: ["existing-transaction"],
        },
      ],
    };
    const { onCommit } = renderReview({
      transactions: completeTransactions,
      probableDuplicateConflict,
      sort: "amount-asc",
    });

    expect(
      screen.getAllByText("Probable duplicate Transactions"),
    ).toHaveLength(2);
    expect(screen.getAllByText(/Transaction 1.*Northline Properties/u)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Resolve duplicate warning above" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Import anyway" })[0]);
    expect(onCommit).toHaveBeenCalledWith(true);

    cleanup();
    renderReview({
      transactions: completeTransactions,
      commitError: new ApiError("The statement file has already been imported", {
        kind: "http",
        status: 409,
        code: "STATEMENT_IMPORT_FILE_ALREADY_EXISTS",
      }),
      hasFileDuplicate: true,
    });

    expect(screen.getAllByText("Statement already imported")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Import 2 Transactions" }),
    ).toHaveProperty("disabled", true);

    cleanup();
    renderReview({
      transactions: completeTransactions,
      commitError: new Error("The API is unavailable."),
    });

    expect(screen.getAllByText("Import could not be saved")).toHaveLength(2);
    expect(screen.getAllByText("The API is unavailable.")).toHaveLength(2);
  });

  it("identifies inactive Category assignments and sends the review back for correction", () => {
    const categoryEligibilityConflict: CategoryEligibilityConflict = {
      message: "Category is inactive",
      details: [
        {
          field: "/transactions/0/categoryId",
          code: "category_inactive",
          message: "The reviewed transaction uses an inactive Category",
          categoryId: "42",
          transactionIndexes: [0],
        },
      ],
    };
    const onBack = vi.fn();

    renderReview({
      transactions: completeTransactions.slice(0, 2),
      categoryEligibilityConflict,
      canConfirm: false,
      onBack,
    });

    expect(
      screen.getAllByText("Category assignments need correction"),
    ).toHaveLength(2);
    expect(screen.getAllByText(/uses Category 42/)).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Back to Categorize" }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Import 2 Transactions" }),
    ).toHaveProperty("disabled", true);
  });
});


describe("read-only expense Review", () => {
  it("groups every expense before expandable exclusions and displays positive amounts", () => {
    renderReview({ transactions: [completeTransactions[2], completeTransactions[1], completeTransactions[0]] });
    const list = screen.getByRole("list", { name: "Transactions to review" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("₱50.00")).toBeTruthy();
    expect(within(list).queryByText("Credit")).toBeNull();
    expect(screen.getAllByText("Excluded rows (1)")).toHaveLength(2);
    expect(screen.getAllByText("Other credit — not an expense")).toHaveLength(2);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});


it("preserves the chosen amount order within both groups and explains excluded expenses and payments", () => {
  renderReview({ sort: "amount-asc", transactions: [
    completeTransactions[0], completeTransactions[1],
    { ...completeTransactions[0], id: "excluded-expense", description: "Excluded purchase", isExcluded: true },
    { ...completeTransactions[2], id: "payment", description: "PAYMENT RECEIVED", amount: 100, activityKind: "payment" },
    completeTransactions[2],
  ] });
  const included = screen.getByRole("list", { name: "Transactions to review" });
  expectBefore(within(included).getByText("Green Market Cafe"), within(included).getByText("Northline Properties"));
  fireEvent.click(screen.getAllByText("Excluded rows (3)")[0]);
  const excluded = screen.getByRole("list", { name: "Excluded rows to review" });
  expectBefore(within(excluded).getByText("Store refund"), within(excluded).getByText("Excluded purchase"));
  expectBefore(within(excluded).getByText("Excluded purchase"), within(excluded).getByText("PAYMENT RECEIVED"));
  expect(within(excluded).getByText("Excluded by you")).toBeTruthy();
  expect(within(excluded).getByText("Payment — not an expense")).toBeTruthy();
});
