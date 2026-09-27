import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getCategoryColorClass, getCategoryColorOption } from "@/shared/category";
import { centsToMoney, formatMoney } from "@/shared/money";
import { formatReportingPeriod } from "@/shared/reporting-period";

import type {
  InsightsCategory,
  InsightsDay,
  InsightsMonth,
  InsightsReportResult,
} from "./insights-service";

interface CategorySpendingChartProps {
  readonly report: InsightsReportResult;
}

interface TrendPoint {
  readonly key: string;
  readonly periodLabel: string;
  readonly axisLabel: string;
  readonly axisLabelVisible: boolean;
  readonly amountsByCategory: ReadonlyMap<string | null, number>;
}

interface CategoryTrend {
  readonly category: InsightsCategory & { readonly id: string };
  readonly amountsCents: readonly number[];
  readonly budgetReferenceCents: number | null;
}

const shortMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

const sharedColorLinePatterns = ["6 4", "2 3", "8 3 2 3"] as const;

function CategorySpendingChart({ report }: CategorySpendingChartProps) {
  const [selectedCategoryIds, setSelectedCategoryIds] =
    useState<ReadonlySet<string> | null>(null);
  const [showBudgetReferences, setShowBudgetReferences] = useState(true);
  const categories = report.selectableCategories.filter(
    (category): category is InsightsCategory & { readonly id: string } =>
      category.id !== null,
  );
  const defaultCategoryIds = new Set(
    categories
      .filter((category) => category.spendingCents > 0)
      .map(({ id }) => id),
  );
  const selectedIds = selectedCategoryIds ?? defaultCategoryIds;
  const selectedCategories = categories.filter(({ id }) => selectedIds.has(id));
  const points = createTrendPoints(report);
  const hasSelectedBudget = selectedCategories.some(
    ({ monthlyBudgetCents }) => monthlyBudgetCents !== null,
  );
  const showSelectedBudgetReferences =
    showBudgetReferences && hasSelectedBudget;
  const trends: CategoryTrend[] = selectedCategories.map((category) => ({
    category,
    amountsCents: points.map(
      ({ amountsByCategory }) => amountsByCategory.get(category.id) ?? 0,
    ),
    budgetReferenceCents:
      showSelectedBudgetReferences && category.monthlyBudgetCents !== null
        ? report.view === "monthly"
          ? category.monthlyBudgetCents / report.days.length
          : category.monthlyBudgetCents
        : null,
  }));
  const axisMaximum = Math.max(
    100,
    ...trends.flatMap((trend) => [
      ...trend.amountsCents,
      trend.budgetReferenceCents ?? 0,
    ]),
  );
  const lineDashByCategoryId = createLineDashMap(categories);
  const hasCategoryOptions = categories.length > 0;
  const hasSelectedSpending = selectedCategories.some(
    ({ spendingCents }) => spendingCents > 0,
  );

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((currentSelection) => {
      const nextSelection = new Set(currentSelection ?? defaultCategoryIds);
      if (nextSelection.has(categoryId)) {
        nextSelection.delete(categoryId);
      } else {
        nextSelection.add(categoryId);
      }
      return nextSelection;
    });
  }

  return (
    <Card variant="strong" className="flex flex-col">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle id="insights-category-spending-title">
              Spending by Category
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.view === "monthly"
                ? "Daily movement · select Categories to compare"
                : "Monthly movement · select Categories to compare"}
            </p>
          </div>
          <div className="flex min-h-10 items-center gap-2 border border-border px-3">
            <Checkbox
              id="insights-category-budgets"
              checked={showBudgetReferences}
              disabled={!hasSelectedBudget}
              onCheckedChange={(checked) =>
                setShowBudgetReferences(checked === true)
              }
            />
            <Label
              htmlFor="insights-category-budgets"
              className="text-sm normal-case"
            >
              Category Budgets
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div role="group" aria-label="Categories to compare" className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const selected = selectedIds.has(category.id);

            return (
              <button
                key={category.id}
                type="button"
                aria-label={category.label}
                aria-pressed={selected}
                onClick={() => toggleCategory(category.id)}
                className={cn(
                  "focus-ledger inline-flex min-h-8 items-center gap-2 border px-2.5 text-sm",
                  selected
                    ? "border-foreground bg-background text-foreground"
                    : "border-border bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-3 shrink-0",
                    category.color === null
                      ? "border border-foreground/60 bg-muted-foreground"
                      : getCategoryColorClass(category.color),
                  )}
                />
                {category.label}
              </button>
            );
          })}
        </div>

        {selectedCategories.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            {hasCategoryOptions
              ? "Select a Category to see its spending trend."
              : "No Categories are available to compare in this Space."}
          </p>
        ) : (
          <>
            {!hasSelectedSpending ? (
              <p role="status" className="text-sm text-muted-foreground">
                No spending was recorded for the selected Categories in this period.
              </p>
            ) : null}

            <p className="text-sm text-muted-foreground">
              {showSelectedBudgetReferences ? (
                report.view === "monthly" ? (
                  <>
                    Dashed references show each selected Category’s daily Budget pace,
                    calculated from its current monthly Budget across {report.days.length} days.
                    This is a pace guide, not a daily limit.
                  </>
                ) : (
                  <>
                    Dashed references show each selected Category’s current monthly Budget.
                    Historical comparisons use current Budgets.
                  </>
                )
              ) : showBudgetReferences ? (
                "No selected Category has a current monthly Budget reference."
              ) : (
                "Category Budget references are hidden."
              )}
            </p>

            <figure aria-labelledby="insights-category-spending-title">
              <div
                aria-hidden="true"
                className="relative h-56 w-full sm:h-60"
              >
                <div className="absolute inset-x-0 bottom-7 top-2 flex gap-2">
                  <div className="flex w-16 shrink-0 flex-col justify-between font-mono text-xs tabular-nums text-muted-foreground">
                    {[axisMaximum, axisMaximum / 2, 0].map((value) => (
                      <span key={value} className="whitespace-nowrap text-right">
                        {formatMoney(centsToMoney(value))}
                      </span>
                    ))}
                  </div>
                  <div className="relative min-w-0 flex-1 border-b border-foreground">
                    {[0, 50, 100].map((position) => (
                      <div
                        key={position}
                        className="pointer-events-none absolute inset-x-0 border-t border-border"
                        style={{ top: `${position}%` }}
                      />
                    ))}
                    <svg
                      className="absolute inset-0 size-full overflow-visible"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {trends.map(({ category, budgetReferenceCents }) =>
                        budgetReferenceCents === null ? null : (
                          <line
                            key={`${category.id}-budget`}
                            x1="0"
                            x2="100"
                            y1={getYCoordinate(budgetReferenceCents, axisMaximum)}
                            y2={getYCoordinate(budgetReferenceCents, axisMaximum)}
                            stroke="currentColor"
                            strokeDasharray="3 3"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                            style={getCategoryStrokeStyle(category)}
                          />
                        ),
                      )}
                      {trends.map(({ category, amountsCents }) => (
                        <polyline
                          key={category.id}
                          fill="none"
                          stroke="currentColor"
                          strokeDasharray={lineDashByCategoryId.get(category.id)}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                          points={amountsCents
                            .map((amount, index) =>
                              `${getXCoordinate(index, amountsCents.length)},${getYCoordinate(amount, axisMaximum)}`,
                            )
                            .join(" ")}
                          style={getCategoryStrokeStyle(category)}
                        />
                      ))}
                    </svg>
                  </div>
                </div>
                <div className="absolute inset-x-[4.5rem] bottom-0 flex h-6 font-mono text-xs tabular-nums text-muted-foreground">
                  {points.map((point) => (
                    <span
                      key={point.key}
                      className={cn(
                        "min-w-0 flex-1 text-center",
                        !point.axisLabelVisible && "invisible",
                      )}
                    >
                      {point.axisLabel}
                    </span>
                  ))}
                </div>
              </div>

              <ul
                aria-label="Selected Categories in trend chart"
                className="mt-2 flex flex-wrap gap-x-4 gap-y-2"
              >
                {trends.map(({ category }) => (
                  <li
                    key={category.id}
                    className="inline-flex items-center gap-2 text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-3 shrink-0",
                        category.color === null
                          ? "border border-foreground/60 bg-muted-foreground"
                          : getCategoryColorClass(category.color),
                      )}
                    />
                    <span>{category.label}</span>
                    {category.monthlyBudgetCents !== null &&
                    showSelectedBudgetReferences ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatMoney(
                          centsToMoney(
                            category.monthlyBudgetCents /
                              (report.view === "monthly"
                                ? report.days.length
                                : 1),
                          ),
                        )}
                        {report.view === "monthly" ? " / day pace" : " / month"}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="sr-only">
                <table>
                  <caption>
                    Category spending values for {formatReportingPeriod(report.period)}.
                    Amounts are in PHP. {report.view === "monthly"
                      ? "Each row is a calendar day in the selected month."
                      : "Each row is one month in the rolling 12-month period."}
                    {showSelectedBudgetReferences
                      ? report.view === "monthly"
                        ? " Daily Budget pace values use each Category’s current monthly Budget divided by the selected month’s day count; they are pace guides, not daily limits."
                        : " Historical comparisons use each Category’s current monthly Budget."
                      : " Category Budget references are hidden."}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        {report.view === "monthly" ? "Date" : "Reporting Period"}
                      </th>
                      {trends.map(({ category }) => (
                        <th key={category.id} scope="col">
                          {category.label} spending
                        </th>
                      ))}
                      {trends.map(({ category, budgetReferenceCents }) =>
                        budgetReferenceCents === null ? null : (
                          <th key={`${category.id}-budget`} scope="col">
                            {category.label}{" "}
                            {report.view === "monthly"
                              ? "daily Budget pace"
                              : "monthly Budget"}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr key={point.key}>
                        <th scope="row">{point.periodLabel}</th>
                        {trends.map(({ category }) => (
                          <td key={category.id}>
                            {formatMoney(
                              centsToMoney(
                                point.amountsByCategory.get(category.id) ?? 0,
                              ),
                            )}
                          </td>
                        ))}
                        {trends.map(({ category, budgetReferenceCents }) =>
                          budgetReferenceCents === null ? null : (
                            <td key={`${category.id}-budget-${point.key}`}>
                              {formatMoney(centsToMoney(budgetReferenceCents))}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </figure>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function createTrendPoints(report: InsightsReportResult): TrendPoint[] {
  if (report.view === "monthly") {
    return report.days.map((day: InsightsDay) => ({
      key: day.date,
      periodLabel: day.date,
      axisLabel: String(day.day),
      axisLabelVisible:
        day.day === 1 || day.day % 5 === 0 || day.day === report.days.length,
      amountsByCategory: new Map(
        day.categories.map(({ categoryId, amountCents }) => [
          categoryId,
          amountCents,
        ]),
      ),
    }));
  }

  return report.months.map((month: InsightsMonth) => ({
    key: month.period,
    periodLabel: formatReportingPeriod(month.period),
    axisLabel: shortMonthFormatter.format(
      new Date(`${month.period}-01T00:00:00Z`),
    ),
    axisLabelVisible: true,
    amountsByCategory: new Map(
      month.categories.map(({ categoryId, amountCents }) => [
        categoryId,
        amountCents,
      ]),
    ),
  }));
}

function createLineDashMap(
  categories: readonly (InsightsCategory & { readonly id: string })[],
): ReadonlyMap<string, string | undefined> {
  const colorCounts = new Map<string, number>();
  const patterns = new Map<string, string | undefined>();

  categories.forEach(({ id, color }) => {
    const colorKey = color ?? "none";
    const count = colorCounts.get(colorKey) ?? 0;
    patterns.set(
      id,
      count === 0
        ? undefined
        : sharedColorLinePatterns[(count - 1) % sharedColorLinePatterns.length],
    );
    colorCounts.set(colorKey, count + 1);
  });

  return patterns;
}

function getCategoryStrokeStyle(category: InsightsCategory) {
  return {
    color:
      category.color === null
        ? "currentColor"
        : `var(--category-${getCategoryColorOption(category.color).value})`,
  };
}

function getXCoordinate(index: number, count: number): number {
  return count <= 1 ? 50 : (index / (count - 1)) * 100;
}

function getYCoordinate(amountCents: number, axisMaximum: number): number {
  return 100 - (amountCents / axisMaximum) * 100;
}

export { CategorySpendingChart };
