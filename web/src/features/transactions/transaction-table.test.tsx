// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Transaction } from "./transactions-service";
import { TransactionTable } from "./transaction-table";

afterEach(cleanup);

describe("TransactionTable Category Colors", () => {
  it("filters loaded rows and sorts expenses by magnitude", () => {
    const first: Transaction = {
      id: "1", categoryId: "food", purchaseDate: "2026-08-01", date: "Aug 1",
      description: "Groceries", category: "other", categoryLabel: "Food",
      categoryColor: null, account: "Cash", amount: -20, source: "manual", statementImportId: null,
    };
    const second: Transaction = {
      ...first, id: "2", categoryId: "housing", purchaseDate: "2026-08-02",
      date: "Aug 2", description: "Rent", categoryLabel: "Housing", amount: -100,
    };
    render(<TransactionTable transactions={[first, second]} emptyMessage="Empty" />);

    fireEvent.change(screen.getByLabelText("Search Transactions"), { target: { value: "rent" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("1 of 2");
    fireEvent.change(screen.getByLabelText("Search Transactions"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Filter Transactions" }));
    fireEvent.change(screen.getAllByLabelText("From")[0], { target: { value: "2026-08-02" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("status").textContent).toContain("1 of 2");
    fireEvent.change(screen.getAllByLabelText("From")[0], { target: { value: "" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")[1].textContent).toContain("Rent");
  });
  it("uses the persisted Category Color in mobile and desktop rows", () => {
    const transaction: Transaction = {
      id: "10",
      categoryId: "42",
      purchaseDate: "2026-08-31",
      date: "Aug 31",
      description: "Monthly rent",
      category: "housing",
      categoryLabel: "Housing",
      categoryColor: "teal",
      account: "BDO · AMEX",
      amount: -70,
      source: "imported",
      statementImportId: "100",
    };

    render(
      <TransactionTable
        transactions={[transaction]}
        emptyMessage="No Transactions"
      />,
    );

    for (const categoryLabel of screen.getAllByText("Housing")) {
      expect(
        categoryLabel.parentElement?.querySelector('[aria-hidden="true"]')
          ?.className,
      ).toContain("bg-category-teal");
    }
  });

  it("shows immutable creator attribution for shared rows", () => {
    const transaction: Transaction = {
      id: "10",
      categoryId: null,
      purchaseDate: "2026-08-31",
      date: "Aug 31",
      description: "Shared lunch",
      category: "other",
      categoryLabel: "Uncategorized",
      categoryColor: null,
      account: "Cash",
      amount: -10,
      source: "manual",
      statementImportId: null,
      addedByUserId: "8",
    };

    render(
      <TransactionTable
        transactions={[transaction]}
        emptyMessage="No Transactions"
        showAttribution
      />,
    );

    expect(screen.getAllByText("Added by User 8")).toHaveLength(2);
  });

  it("uses retained member names for shared creator attribution", () => {
    const transaction: Transaction = {
      id: "11",
      categoryId: null,
      purchaseDate: "2026-08-31",
      date: "Aug 31",
      description: "Archived lunch",
      category: "other",
      categoryLabel: "Uncategorized",
      categoryColor: null,
      account: "Cash",
      amount: -10,
      source: "manual",
      statementImportId: null,
      addedByUserId: "8",
    };

    render(
      <TransactionTable
        transactions={[transaction]}
        emptyMessage="No Transactions"
        showAttribution
        attributionMembers={[{ id: "8", name: "Deleted user" }]}
      />,
    );

    expect(screen.getAllByText("Added by Deleted user")).toHaveLength(2);
  });
});
