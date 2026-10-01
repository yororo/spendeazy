import { getCurrentReportingPeriod, getReportingPeriodBounds, type ReportingPeriod } from "@/shared/reporting-period";
import type { InsightsCategory } from "./insights-service";

const PATTERN_WINDOW_MONTHS = 6;
const PATTERN_MINIMUM_MONTHS = 3;
const PATTERN_MULTIPLIER = 1.5;
const PATTERN_MINIMUM_INCREASE_CENTS = 50_000;

interface PatternTransaction {
  readonly id: string;
  readonly categoryId: string | null;
  readonly date: string;
  readonly description: string;
  readonly amountCents: number;
}

interface PatternMonth {
  readonly period: ReportingPeriod;
  readonly cutoff: string;
  readonly amountCents: number;
  readonly transactions: readonly PatternTransaction[];
}

interface CategoryPattern {
  readonly category: InsightsCategory & { readonly id: string };
  readonly status: "insufficient" | "potential" | "no-signal";
  readonly selectedCents: number;
  readonly selectedTransactions: readonly PatternTransaction[];
  readonly comparisons: readonly PatternMonth[];
  readonly medianCents: number | null;
}

interface SpendingPatterns {
  readonly windowStart: ReportingPeriod;
  readonly windowEnd: ReportingPeriod;
  readonly selectedCutoff: string;
  readonly dayCutoff: number | null;
  readonly future: boolean;
  readonly categories: readonly CategoryPattern[];
}

function createSpendingPatterns(period: ReportingPeriod, categories: readonly InsightsCategory[], transactions: readonly PatternTransaction[], now = new Date()): SpendingPatterns {
  const current = getCurrentReportingPeriod(now);
  const future = period > current;
  const dayCutoff = period === current ? now.getDate() : null;
  const [year, month] = period.split("-").map(Number);
  const months = Array.from({ length: PATTERN_WINDOW_MONTHS }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - PATTERN_WINDOW_MONTHS - 1 + index, 1));
    const comparisonPeriod = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` as ReportingPeriod;
    const bounds = getReportingPeriodBounds(comparisonPeriod);
    return { period: comparisonPeriod, cutoff: dayCutoff === null ? bounds.toDate : `${comparisonPeriod}-${String(Math.min(dayCutoff, bounds.daysInPeriod)).padStart(2, "0")}` };
  });
  const selectedCutoff = dayCutoff === null ? getReportingPeriodBounds(period).toDate : `${period}-${String(dayCutoff).padStart(2, "0")}`;
  const contributions = (categoryId: string, monthPeriod: ReportingPeriod, cutoff: string) => transactions.filter((transaction) => transaction.categoryId === categoryId && transaction.date >= `${monthPeriod}-01` && transaction.date <= cutoff && transaction.amountCents > 0);
  const sum = (items: readonly PatternTransaction[]) => items.reduce((total, item) => total + item.amountCents, 0);
  return {
    windowStart: months[0]!.period,
    windowEnd: months[PATTERN_WINDOW_MONTHS - 1]!.period,
    selectedCutoff,
    dayCutoff,
    future,
    categories: categories.filter((category): category is InsightsCategory & { readonly id: string } => category.id !== null).map((category) => {
      const selectedTransactions = future ? [] : contributions(category.id, period, selectedCutoff);
      const selectedCents = sum(selectedTransactions);
      const comparisons = future ? [] : months.map((month): PatternMonth => {
        const items = contributions(category.id, month.period, month.cutoff);
        return { ...month, amountCents: sum(items), transactions: items };
      }).filter(({ amountCents }) => amountCents > 0);
      const amounts = comparisons.map(({ amountCents }) => amountCents).sort((a, b) => a - b);
      const middle = Math.floor(amounts.length / 2);
      const medianCents = amounts.length < PATTERN_MINIMUM_MONTHS ? null : amounts.length % 2 === 0 ? (amounts[middle - 1]! + amounts[middle]!) / 2 : amounts[middle]!;
      return {
        category, selectedCents, selectedTransactions, comparisons, medianCents,
        status: medianCents === null ? "insufficient" : selectedCents >= medianCents * PATTERN_MULTIPLIER && selectedCents - medianCents >= PATTERN_MINIMUM_INCREASE_CENTS ? "potential" : "no-signal",
      };
    }),
  };
}

export { createSpendingPatterns, PATTERN_WINDOW_MONTHS, PATTERN_MINIMUM_MONTHS, PATTERN_MULTIPLIER, PATTERN_MINIMUM_INCREASE_CENTS };
export type { SpendingPatterns, PatternTransaction };
