import { describe, expect, it } from "vitest";
import type { ReportingPeriod } from "@/shared/reporting-period";
import { createBudgetReviews } from "./budget-reviews";

const category = { id: "1", label: "Synthetic", color: "teal" as const, spendingCents: 0, monthlyBudgetCents: 100_000 };
const transactions = [
  ["2024-01-10", 100_001], ["2025-02-10", 110_000], ["2026-03-10", 120_000],
  ["2026-05-10", 100_000], ["2026-06-10", 90_000], ["2026-08-10", 80_000],
  ["2026-09-10", 130_000], ["2026-10-10", 140_000],
].map(([date, amountCents], index) => ({ id: String(index), categoryId: "1", date: String(date), description: "Synthetic", amountCents: Number(amountCents) }));

describe("recurring Budget review evidence", () => {
  it("uses six eligible completed recorded months, reaching across gaps and excluding current/future months", () => {
    const [review] = createBudgetReviews("2026-09" as ReportingPeriod, [category], transactions, new Date(2026, 8, 19));
    expect(review?.breachCount).toBe(3);
    expect(review?.months.map(({ period }) => period)).toEqual(["2026-08", "2026-06", "2026-05", "2026-03", "2025-02", "2024-01"]);
    expect(review?.suggestReview).toBe(true);
  });
  it("includes a completed historical selected month and excludes all later months", () => {
    const [review] = createBudgetReviews("2026-05" as ReportingPeriod, [category], transactions, new Date(2026, 8, 19));
    expect(review?.months).toHaveLength(4);
    expect(review?.breachCount).toBe(3);
    expect(review?.months[0]).toEqual({ period: "2026-05", amountCents: 100_000 });
  });
  it("shows the actual denominator and recalculates using a changed current limit", () => {
    const [review] = createBudgetReviews("2026-03" as ReportingPeriod, [{ ...category, monthlyBudgetCents: 110_000 }], transactions, new Date(2026, 8, 19));
    expect(review?.months).toHaveLength(3);
    expect(review?.breachCount).toBe(1);
    expect(review?.suggestReview).toBe(false);
  });
  it("does not classify unbudgeted or yearly-only Categories as recurring breaches", () => {
    const [review] = createBudgetReviews("2026-09" as ReportingPeriod, [{ ...category, monthlyBudgetCents: null }], transactions, new Date(2026, 8, 19));
    expect(review?.months).toHaveLength(6);
    expect(review?.breachCount).toBe(0);
    expect(review?.suggestReview).toBe(false);
  });
  it("ignores months without positive recorded spending and caps future selections before the current month", () => {
    const [review] = createBudgetReviews("2026-10" as ReportingPeriod, [category], [...transactions, { id: "zero", categoryId: "1", date: "2026-07-10", description: "Synthetic", amountCents: 0 }], new Date(2026, 8, 19));
    expect(review?.months.map(({ period }) => period)).toEqual(["2026-08", "2026-06", "2026-05", "2026-03", "2025-02", "2024-01"]);
  });
});
