import { describe, expect, it } from "vitest";

import { getDefaultCategoryColor } from "@/shared/category";
import type { CategorizedStatementEntry } from "./statement-categorizer";
import { createStatementReviewData } from "./statement-review-data";

const expense: CategorizedStatementEntry = {
  id: "a",
  entryDate: new Date("2026-10-01T00:00:00.000Z"),
  postingDate: new Date("2026-10-02T00:00:00.000Z"),
  description: "Fixture expense",
  amount: -0.1,
  categoryId: "42",
  assignment: "rule",
  matchedCategoryIds: ["42"],
  isExcluded: false,
};

function review(entries: readonly CategorizedStatementEntry[]) {
  return createStatementReviewData(
    entries, "amount-asc", (id) => id === "42" ? "Groceries" : "Unknown Category", getDefaultCategoryColor,
  );
}

describe("Statement Review data", () => {
  it("returns zero summaries and empty groups without Expenses", () => {
    expect(review([])).toMatchObject({
      includedExpenses: [], excludedExpenses: [], categoryBreakdown: [],
      debitTotal: 0, averageDebit: 0, categorizedDebitTotal: 0,
      largestCategoryAmount: 0, ruleCount: 0, manualCount: 0,
      excludedCount: 0, hasUnmappedExpenses: false,
    });
  });

  it("preserves exact included cents and existing fractional Category accumulation", () => {
    const data = review([expense, { ...expense, id: "b", amount: -0.2 }]);
    expect(data.debitTotal).toBe(0.3);
    expect(data.averageDebit).toBe(0.15);
    expect(data.categoryBreakdown[0].amount).toBe(0.30000000000000004);
    expect(data.categorizedDebitTotal).toBe(0.30000000000000004);
    expect(data.largestCategoryAmount).toBe(0.30000000000000004);
  });

  it("counts included assignments and keeps excluded purchases and payments out of totals", () => {
    const data = review([
      expense,
      { ...expense, id: "manual", assignment: "manual" },
      { ...expense, id: "ambiguous", assignment: "ambiguous", categoryId: null },
      { ...expense, id: "unmapped", assignment: "unmapped", categoryId: null },
      { ...expense, id: "excluded", isExcluded: true, amount: -100 },
      { ...expense, id: "payment", isExcluded: true, amount: 500, activityKind: "payment" },
    ]);
    expect(data.debitTotal).toBe(0.4);
    expect(data.excludedCount).toBe(2);
    expect(data.ruleCount).toBe(1);
    expect(data.manualCount).toBe(1);
    expect(data.categorizedExpenses).toHaveLength(2);
    expect(data.unmappedExpenses).toHaveLength(2);
    expect(data.ambiguousExpenses).toHaveLength(1);
    expect(data.hasUnmappedExpenses).toBe(true);
    expect(data.categoryBreakdown[0]).toMatchObject({ amount: 0.2, share: 50 });
  });

  it("sorts ties by row ID without mutating inputs and retains equal Category order", () => {
    const rows = Object.freeze([
      Object.freeze({ ...expense, id: "z", categoryId: "unknown" }),
      Object.freeze({ ...expense, id: "a" }),
      Object.freeze({ ...expense, id: "excluded-z", isExcluded: true }),
      Object.freeze({ ...expense, id: "excluded-a", isExcluded: true }),
    ]);
    const data = review(rows);
    expect(rows.map(({ id }) => id)).toEqual(["z", "a", "excluded-z", "excluded-a"]);
    expect(data.includedExpenses.map(({ id }) => id)).toEqual(["a", "z"]);
    expect(data.excludedExpenses.map(({ id }) => id)).toEqual(["excluded-a", "excluded-z"]);
    expect(data.categoryBreakdown.map(({ categoryId }) => categoryId)).toEqual(["42", "unknown"]);
    expect(data.categoryBreakdown[1]).toMatchObject({
      label: "Unknown Category", color: getDefaultCategoryColor("unknown"), share: 50,
    });
  });
});
