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
import { getCategoryColorClass } from "@/shared/category";
import { centsToMoney, formatMoney } from "@/shared/money";
import { describeBudget } from "@/shared/budget";
import { formatReportingPeriod } from "@/shared/reporting-period";

import type { InsightsYearlyReport } from "./insights-service";

interface YearlySpendingChartProps {
  readonly report: InsightsYearlyReport;
}

const shortMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function YearlySpendingChart({ report }: YearlySpendingChartProps) {
  const [showBudgetComparison, setShowBudgetComparison] = useState(true);
  const hasMonthlyBudget = report.monthlyBudgetCents > 0;
  const visibleBudgetComparison = showBudgetComparison && hasMonthlyBudget;
  const highestMonthlySpending = Math.max(
    0,
    ...report.months.map(({ totalSpendingCents }) => totalSpendingCents),
  );
  const axisMaximum = Math.max(
    100,
    highestMonthlySpending,
    report.monthlyBudgetCents,
  );
  const budgetLabel = formatMoney(centsToMoney(report.monthlyBudgetCents));
  const months = report.months.map((month) => ({
    month,
    amountsByCategory: new Map<string | null, number>(
      month.categories.map(({ categoryId, amountCents }) => [
        categoryId,
        amountCents,
      ]),
    ),
  }));
  const hasBreaches = months.some(({ month }) => month.isOverBudget);

  return (
    <Card variant="strong" className="flex flex-col">
      <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle id="insights-yearly-spending-title">
            Monthly total spending
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            12-month view, stacked by Category.
          </p>
        </div>
        <div className="flex min-h-10 items-center gap-2 border border-border px-3">
          <Checkbox
            id="insights-monthly-budget"
            checked={showBudgetComparison}
            disabled={!hasMonthlyBudget}
            onCheckedChange={(checked) =>
              setShowBudgetComparison(checked === true)
            }
          />
          <Label
            htmlFor="insights-monthly-budget"
            className="text-sm normal-case"
          >
            Monthly Budget
          </Label>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {report.totalSpendingCents === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            No spending was recorded in this 12-month window.
          </p>
        ) : null}

        {visibleBudgetComparison ? (
          <p id="insights-yearly-budget-description" className="text-sm">
            Dashed line: <span className="font-mono font-semibold">{budgetLabel} per month</span>
            <span className="text-muted-foreground">
              {" "}from current monthly Budgets. Bars include all Transactions;
              the line and Over Budget markers compare Budgeted Spending only.
              A ! marks a month above its Budget.
            </span>
          </p>
        ) : hasMonthlyBudget ? (
          <p className="text-sm text-muted-foreground">
            Monthly Budget comparison is hidden. Show it to compare Budgeted
            Spending with current monthly Budgets.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No current monthly Budgets are available for comparison.
          </p>
        )}

        <figure aria-labelledby="insights-yearly-spending-title">
          <div aria-hidden="true" className="flex h-64 w-full gap-2 pb-2">
            <div className="relative mb-5 flex w-[4.5rem] shrink-0 flex-col justify-between font-mono text-xs tabular-nums text-muted-foreground">
              {[axisMaximum, axisMaximum / 2, 0].map((value) => (
                <span key={value} className="whitespace-nowrap text-right">
                  {formatMoney(centsToMoney(value))}
                </span>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1 border-b border-foreground">
                {[0, 50, 100].map((position) => (
                  <div
                    key={position}
                    className="pointer-events-none absolute inset-x-0 border-t border-border"
                    style={{ top: `${position}%` }}
                  />
                ))}
                <div className="relative z-10 flex h-full items-end gap-1">
                  {months.map(({ month, amountsByCategory }) => {
                    let stackedCents = 0;
                    const segments = report.categories.map((category) => {
                      const amountCents =
                        amountsByCategory.get(category.id) ?? 0;
                      const bottom = stackedCents;
                      stackedCents += amountCents;

                      return amountCents === 0
                        ? null
                        : { category, amountCents, bottom };
                    });

                    return (
                      <div
                        key={month.period}
                        className="relative flex h-full min-w-0 flex-1 items-end"
                      >
                        {segments.map((segment) =>
                          segment === null ? null : (
                            <div
                              key={segment.category.id ?? "uncategorized"}
                              className={cn(
                                "absolute inset-x-0",
                                segment.category.color === null
                                  ? "border-x border-foreground/60 bg-muted-foreground"
                                  : getCategoryColorClass(
                                      segment.category.color,
                                    ),
                              )}
                              style={{
                                bottom: `${(segment.bottom / axisMaximum) * 100}%`,
                                height: `${(segment.amountCents / axisMaximum) * 100}%`,
                              }}
                            />
                          ),
                        )}
                        {visibleBudgetComparison && month.isOverBudget ? (
                          <span
                            data-testid="yearly-over-budget-marker"
                            className="absolute inset-x-0 text-center font-mono text-sm font-bold text-destructive"
                            style={{
                              bottom: `${(month.totalSpendingCents / axisMaximum) * 100}%`,
                              transform: "translateY(-100%)",
                            }}
                          >
                            !
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {visibleBudgetComparison ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-dashed border-foreground"
                    style={{
                      top: `${100 - (report.monthlyBudgetCents / axisMaximum) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
              <div className="flex h-6 shrink-0 gap-1 pt-1 font-mono text-xs tabular-nums text-muted-foreground">
                {months.map(({ month }) => {
                  const label = shortMonthFormatter.format(
                    new Date(`${month.period}-01T00:00:00Z`),
                  );

                  return (
                    <span
                      key={month.period}
                      className="min-w-0 flex-1 text-center"
                    >
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden">{label.slice(0, 1)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <ul
            aria-label="Categories in chart"
            className="mt-2 flex flex-wrap gap-x-4 gap-y-2"
          >
            {report.categories.map((category) => (
              <li
                key={category.id ?? "uncategorized"}
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
                {category.label}
              </li>
            ))}
          </ul>

          {hasBreaches ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-mono font-bold text-destructive">!</span>
              {" "}marks a month when Budgeted Spending exceeded current monthly
              Budgets.
            </p>
          ) : null}

          <div className="sr-only">
            <table>
              <caption>
                Monthly spending values from{" "}
                {formatReportingPeriod(report.months[0]!.period)} through{" "}
                {formatReportingPeriod(report.period)}. Total spending includes
                all Transactions, including unbudgeted and Uncategorized
                Transactions. Budgeted Spending includes Transactions in
                Categories with a current monthly Budget. Historical comparisons
                use current monthly Budgets; past Budget amounts are not
                reconstructed.
                {visibleBudgetComparison
                  ? ` The monthly Budget reference is ${budgetLabel}; Over Budget status compares Budgeted Spending with this amount.`
                  : " Budget status remains listed even when the reference is hidden."}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Reporting Period</th>
                  <th scope="col">Total spending</th>
                  <th scope="col">Budgeted Spending</th>
                  <th scope="col">Current monthly Budget</th>
                  <th scope="col">Budget status</th>
                  {report.categories.map((category) => (
                    <th key={category.id ?? "uncategorized"} scope="col">
                      {category.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map(({ month, amountsByCategory }) => (
                  <tr key={month.period}>
                    <th scope="row">
                      {formatReportingPeriod(month.period)}
                    </th>
                    <td>
                      {formatMoney(centsToMoney(month.totalSpendingCents))}
                    </td>
                    <td>
                      {formatMoney(centsToMoney(month.budgetedSpendingCents))}
                    </td>
                    <td>{budgetLabel}</td>
                    <td>
                      {!hasMonthlyBudget
                        ? "No current monthly Budget"
                        : month.totalSpendingCents === 0
                          ? "No spending recorded"
                          : describeBudget(month.budgetedSpendingCents, report.monthlyBudgetCents)}
                    </td>
                    {report.categories.map((category) => (
                      <td key={category.id ?? "uncategorized"}>
                        {formatMoney(
                          centsToMoney(
                            amountsByCategory.get(category.id) ?? 0,
                          ),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}

export { YearlySpendingChart };
