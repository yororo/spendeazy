// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Expense } from "./expenses-service";
import { ExpenseTable } from "./expense-table";

afterEach(cleanup);

describe("ExpenseTable Category Colors", () => {
  it("filters loaded rows and sorts expenses by magnitude", () => {
    const first: Expense = {
      id: "1", categoryId: "food", purchaseDate: "2026-08-01", date: "Aug 1",
      description: "Groceries", category: "other", categoryLabel: "Food",
      categoryColor: null, account: "Cash", amount: -20, source: "manual", statementImportId: null,
    };
    const second: Expense = {
      ...first, id: "2", categoryId: "housing", purchaseDate: "2026-08-02",
      date: "Aug 2", description: "Rent", categoryLabel: "Housing", amount: -100,
    };
    render(<ExpenseTable expenses={[first, second]} emptyMessage="Empty" />);

    fireEvent.change(screen.getByLabelText("Search Expenses"), { target: { value: "rent" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("1 of 2");
    fireEvent.change(screen.getByLabelText("Search Expenses"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Filter Expenses" }));
    fireEvent.change(screen.getAllByLabelText("From")[0], { target: { value: "2026-08-02" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("status").textContent).toContain("1 of 2");
    fireEvent.change(screen.getAllByLabelText("From")[0], { target: { value: "" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")[1].textContent).toContain("Rent");
  });
  it("uses the persisted Category Color in mobile and desktop rows", () => {
    const expense: Expense = {
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
      <ExpenseTable
        expenses={[expense]}
        emptyMessage="No Expenses"
      />,
    );

    for (const categoryLabel of screen.getAllByText("Housing")) {
      expect(
        categoryLabel.parentElement?.querySelector('[aria-hidden="true"]')
          ?.className,
      ).toContain("bg-category-teal");
    }
  });

  it("keeps desktop actions visible while mobile actions stay in the overflow menu", () => {
    const expense: Expense = {
      id: "12",
      categoryId: "food",
      purchaseDate: "2026-08-31",
      date: "Aug 31",
      description: "Coffee shop",
      category: "other",
      categoryLabel: "Food",
      categoryColor: null,
      account: "Cash",
      amount: -8,
      source: "manual",
      statementImportId: null,
    };
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onViewActivity = vi.fn();

    render(
      <ExpenseTable
        expenses={[expense]}
        emptyMessage="No Expenses"
        onEdit={onEdit}
        onDelete={onDelete}
        onViewActivity={onViewActivity}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Edit Coffee shop" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Delete Coffee shop" })).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "View activity for Coffee shop" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Activity" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();

    fireEvent.click(
      screen.getAllByRole("button", { name: "More actions for Coffee shop" })[0],
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Activity" }));
    expect(onViewActivity).toHaveBeenCalledWith(expense);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows immutable creator attribution for shared rows", () => {
    const expense: Expense = {
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
      <ExpenseTable
        expenses={[expense]}
        emptyMessage="No Expenses"
        showAttribution
      />,
    );

    expect(screen.getAllByText("Added by User 8")).toHaveLength(2);
  });

  it("uses retained member names for shared creator attribution", () => {
    const expense: Expense = {
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
      <ExpenseTable
        expenses={[expense]}
        emptyMessage="No Expenses"
        showAttribution
        attributionMembers={[{ id: "8", name: "Deleted user" }]}
      />,
    );

    expect(screen.getAllByText("Added by Deleted user")).toHaveLength(2);
  });
});
