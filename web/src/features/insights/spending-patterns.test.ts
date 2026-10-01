import { describe, expect, it } from "vitest";
import type { ReportingPeriod } from "@/shared/reporting-period";
import { createSpendingPatterns } from "./spending-patterns";

const period = "2024-08" as ReportingPeriod;
const category = { id: "42", label: "Food", color: "teal" as const, spendingCents: 0, monthlyBudgetCents: null };
const expense = (date: string, amountCents: number) => ({ id: date, categoryId: "42", date, description: "Synthetic food", amountCents });

describe("recorded Category spending patterns", () => {
  it.each([
    [150000, 100000, "potential"],
    [149999, 100000, "no-signal"],
    [59999, 10000, "no-signal"],
    [60000, 10000, "potential"],
    [150000, 100000.5, "no-signal"],
  ] as const)("checks both exact thresholds for selected %s and median %s", (selected, baseline, status) => {
    const amounts = Number.isInteger(baseline) ? [baseline, baseline, baseline] : [100000, 100000, 100001, 100001];
    const items = amounts.map((amount, index) => expense(`2024-0${index + 2}-01`, amount));
    const result = createSpendingPatterns(period, [category], [...items, expense("2024-08-01", selected)], new Date(2024, 8, 1));
    expect(result.categories[0]).toMatchObject({ status, medianCents: baseline });
  });

  it("uses equivalent days for the current month and excludes later recorded expenses", () => {
    const items = [expense("2024-02-29", 10000), expense("2024-03-30", 20000), expense("2024-04-30", 30000), expense("2024-05-31", 900000), expense("2024-08-30", 80000), expense("2024-08-31", 900000), expense("2024-09-01", 900000)];
    const result = createSpendingPatterns(period, [category], items, new Date(2024, 7, 30));
    expect(result.categories[0]).toMatchObject({ status: "potential", selectedCents: 80000, medianCents: 20000 });
    expect(result.categories[0]!.comparisons.map(({ cutoff }) => cutoff)).toEqual(["2024-02-29", "2024-03-30", "2024-04-30"]);
    expect(result.categories[0]!.selectedTransactions.map(({ id }) => id)).toEqual(["2024-08-30"]);
    const historical = createSpendingPatterns(period, [category], items, new Date(2024, 8, 1));
    expect(historical.categories[0]!.selectedCents).toBe(980000);
    expect(historical.categories[0]!.comparisons).toHaveLength(4);
  });

  it("clamps non-leap February and crosses year boundaries without future leakage", () => {
    const result = createSpendingPatterns("2025-03" as ReportingPeriod, [category], [expense("2025-02-28", 10000), expense("2024-12-31", 10000), expense("2025-01-31", 10000), expense("2025-03-31", 60000)], new Date(2025, 2, 31));
    expect(result.windowStart).toBe("2024-09");
    expect(result.categories[0]).toMatchObject({ status: "potential", medianCents: 10000 });
    expect(result.categories[0]!.comparisons[2]!.cutoff).toBe("2025-02-28");
    const future = createSpendingPatterns("2025-04" as ReportingPeriod, [category], [expense("2025-04-01", 900000)], new Date(2025, 2, 31));
    expect(future.future).toBe(true);
    expect(future.categories[0]).toMatchObject({ status: "insufficient", selectedCents: 0, comparisons: [] });
  });
  it("requires three positive months inside the preceding six calendar months", () => {
    const report = createSpendingPatterns(period, [category], [expense("2024-01-01", 10000), expense("2024-02-01", 10000), expense("2024-07-01", 10000), expense("2024-08-01", 100000)], new Date(2024, 8, 1));
    expect(report.categories[0]).toMatchObject({ status: "insufficient", selectedCents: 100000, medianCents: null });
    expect(report.categories[0]!.comparisons.map(({ period }) => period)).toEqual(["2024-02", "2024-07"]);
  });
});
