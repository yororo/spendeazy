// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

import { ReviewStatement } from "./review-statement";
import type { ProbableDuplicateConflict } from "./statement-import-errors";
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
  statementDate: new Date("2026-08-31T00:00:00.000Z"),
  provider: "BDO",
  accountType: "AMEX",
  totalTransactions: 3,
  totalAmountDue: 65.5,
  totalExtractedAmount: 65.5,
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
  canImportAnyway: true,
  canConfirm: true,
  isCommitting: false,
  hasFileDuplicate: false,
  onBack: vi.fn(),
  onResolve: vi.fn(),
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
    const onResolve = vi.fn();

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
          totalTransactions: 1,
          totalAmountDue: 25.5,
          totalExtractedAmount: 25.5,
        }}
        transactions={[transaction]}
        commitError={null}
        probableDuplicateConflict={null}
        canImportAnyway={true}
        canConfirm={false}
        isCommitting={false}
        hasFileDuplicate={false}
        onBack={vi.fn()}
        onResolve={onResolve}
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
      screen.getAllByRole("button", { name: "Resolve before import" })[0],
    );
    expect(onResolve).toHaveBeenCalledTimes(1);
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
    expect(within(phoneSummary).getByText(/AMEX.*\*{4}/)).toBeTruthy();
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
    expect(within(transactionList).getByText("Store refund")).toBeTruthy();
    expect(within(transactionList).getByText("Aug 02, 2026")).toBeTruthy();
    expect(within(transactionList).getByText("-₱50.00")).toBeTruthy();
    expect(within(transactionList).getByText("-₱15.50")).toBeTruthy();
    expect(within(transactionList).getByText("Rule")).toBeTruthy();
    expect(within(transactionList).getByText("Manual")).toBeTruthy();
    expect(within(transactionList).getAllByText("Unmapped")).toHaveLength(2);
    expect(within(transactionList).getAllByText("Credit")).toHaveLength(2);
    expect(within(transactionList).getByText("Excluded")).toBeTruthy();

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
    });

    expect(
      screen.getAllByText("Probable duplicate Transactions"),
    ).toHaveLength(2);
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
});
