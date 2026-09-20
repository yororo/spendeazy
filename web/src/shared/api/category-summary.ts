import {
  buildApiPath,
  isRecord,
  parseApiCount,
  parseApiMoney,
  type ApiDataErrorFactory,
} from "./api-response";
import { centsToMoney, moneyToCents } from "@/shared/money";
import type { ReportingPeriod } from "@/shared/reporting-period";

function buildMonthlyCategorySummaryPath(
  period: ReportingPeriod,
  spaceId?: string,
) {
  const path =
    spaceId === undefined
      ? "/category-summaries"
      : `/spaces/${encodeURIComponent(spaceId)}/category-summaries`;
  return buildApiPath(path, {
    period: "monthly",
    year: period.slice(0, 4),
    month: period.slice(5),
  });
}

interface CategorySummaryItem {
  readonly categoryId: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly totalAmount: string;
  readonly transactionCount: string;
  readonly budgetAmount: string | null;
  readonly remainingAmount: string | null;
}

interface CategorySummaryResponse {
  readonly period: "monthly" | "yearly";
  readonly year: string;
  readonly month: string | null;
  readonly categories: readonly CategorySummaryItem[];
  readonly uncategorizedTotal: string;
  readonly uncategorizedCount: string;
}

interface CategorySummaryTotals {
  readonly totalAmount: number;
  readonly transactionCount: number;
}

function isCategorySummaryItem(value: unknown): value is CategorySummaryItem {
  return (
    isRecord(value) &&
    typeof value.categoryId === "string" &&
    typeof value.name === "string" &&
    typeof value.isActive === "boolean" &&
    typeof value.totalAmount === "string" &&
    typeof value.transactionCount === "string" &&
    (value.budgetAmount === null || typeof value.budgetAmount === "string") &&
    (value.remainingAmount === null ||
      typeof value.remainingAmount === "string")
  );
}

function requireMonthlyCategorySummary(
  response: unknown,
  createError: ApiDataErrorFactory,
): CategorySummaryResponse {
  if (
    !isRecord(response) ||
    response.period !== "monthly" ||
    typeof response.year !== "string" ||
    (response.month !== null && typeof response.month !== "string") ||
    !Array.isArray(response.categories) ||
    !response.categories.every(isCategorySummaryItem) ||
    typeof response.uncategorizedTotal !== "string" ||
    typeof response.uncategorizedCount !== "string"
  ) {
    throw createError(
      "The API returned an invalid monthly Category Summary.",
    );
  }

  return response as unknown as CategorySummaryResponse;
}

function getCategorySummaryTotals(
  categorySummary: CategorySummaryResponse,
  createError: ApiDataErrorFactory,
): CategorySummaryTotals {
  const uncategorizedTotal = parseApiMoney(
    categorySummary.uncategorizedTotal,
    "uncategorizedTotal",
    createError,
  );
  const totalCents = categorySummary.categories.reduce(
    (total, category) =>
      total +
      moneyToCents(
        parseApiMoney(
          category.totalAmount,
          `Category ${category.categoryId}`,
          createError,
        ),
      ),
    moneyToCents(uncategorizedTotal),
  );
  const transactionCount =
    categorySummary.categories.reduce(
      (total, category) =>
        total +
        parseApiCount(
          category.transactionCount,
          `Category ${category.categoryId}`,
          createError,
        ),
      0,
    ) +
    parseApiCount(
      categorySummary.uncategorizedCount,
      "uncategorizedCount",
      createError,
    );

  return {
    totalAmount: centsToMoney(totalCents),
    transactionCount,
  };
}

export {
  buildMonthlyCategorySummaryPath,
  getCategorySummaryTotals,
  requireMonthlyCategorySummary,
};
export type {
  CategorySummaryItem,
  CategorySummaryResponse,
  CategorySummaryTotals,
};
