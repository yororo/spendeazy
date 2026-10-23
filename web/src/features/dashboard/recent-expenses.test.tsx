// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Expense } from "./dashboard-service";
import { RecentExpenses } from "./recent-expenses";

afterEach(cleanup);

describe("RecentExpenses Category Colors", () => {
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

    render(<RecentExpenses expenses={[expense]} />);

    for (const categoryLabel of screen.getAllByText("Housing")) {
      expect(
        categoryLabel.parentElement?.querySelector('[aria-hidden="true"]')
          ?.className,
      ).toContain("bg-category-teal");
    }
  });
});
