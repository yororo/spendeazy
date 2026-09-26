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

import type { InsightsReport } from "./insights-service";

interface DailySpendingChartProps {
  readonly report: InsightsReport;
}

function DailySpendingChart({ report }: DailySpendingChartProps) {
  const [showBudgetPace, setShowBudgetPace] = useState(true);
  const isBudgetPaceAvailable = report.monthlyBudgetCents > 0;
  const highestDailySpending = Math.max(
    0,
    ...report.days.map((day) => day.spendingCents),
  );
  const axisMaximum = Math.max(
    100,
    highestDailySpending,
    report.dailyBudgetPaceCents,
  );
  const visibleBudgetPace = showBudgetPace && isBudgetPaceAvailable;
  const budgetPaceLabel = `${formatMoney(centsToMoney(report.dailyBudgetPaceCents))} per day`;

  return (
    <Card variant="strong" className="flex flex-col">
      <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle id="insights-daily-spending-title">
            Daily spending
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Total spending by Category for each calendar day.
          </p>
        </div>
        <div className="flex min-h-10 items-center gap-2 border border-border px-3">
          <Checkbox
            id="insights-budget-pace"
            checked={showBudgetPace}
            disabled={!isBudgetPaceAvailable}
            onCheckedChange={(checked) => setShowBudgetPace(checked === true)}
          />
          <Label htmlFor="insights-budget-pace" className="text-sm normal-case">
            Budget pace
          </Label>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {report.totalSpendingCents === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            No spending was recorded for this month.
          </p>
        ) : null}

        {visibleBudgetPace ? (
          <p id="insights-budget-pace-description" className="text-sm">
            Budget pace: <span className="font-mono font-semibold">{budgetPaceLabel}</span>
            <span className="text-muted-foreground">
              {" "}from {formatMoney(centsToMoney(report.monthlyBudgetCents))} in current monthly Budgets over {report.days.length} days. This is a pace guide, not a daily limit.
            </span>
          </p>
        ) : isBudgetPaceAvailable ? (
          <p className="text-sm text-muted-foreground">
            Budget pace is hidden. Show it to compare daily spending with the current monthly Budgets.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No current monthly Budgets are available for a daily Budget pace.
          </p>
        )}

        <figure aria-labelledby="insights-daily-spending-title">
          <div
            aria-hidden="true"
            className="flex h-64 w-full gap-2 pb-2"
          >
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
                <div className="relative z-10 flex h-full items-end gap-px">
                  {report.days.map((day) => {
                    const dailyCategories = new Map(
                      day.categories.map(({ categoryId, amountCents }) => [
                        categoryId,
                        amountCents,
                      ]),
                    );
                    let stackedCents = 0;

                    const segments = report.categories.map((category) => {
                      const amountCents = dailyCategories.get(category.id) ?? 0;
                      const bottom = stackedCents;
                      stackedCents += amountCents;

                      return amountCents === 0
                        ? null
                        : {
                            category,
                            amountCents,
                            bottom,
                          };
                    });

                    return (
                      <div
                        key={day.date}
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
                                  : getCategoryColorClass(segment.category.color),
                              )}
                              style={{
                                bottom: `${(segment.bottom / axisMaximum) * 100}%`,
                                height: `${(segment.amountCents / axisMaximum) * 100}%`,
                              }}
                            />
                          ),
                        )}
                      </div>
                    );
                  })}
                </div>
                {visibleBudgetPace ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-dashed border-foreground"
                    style={{
                      top: `${100 - (report.dailyBudgetPaceCents / axisMaximum) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
              <div className="flex h-6 shrink-0 gap-px pt-1 font-mono text-xs tabular-nums text-muted-foreground">
                {report.days.map((day) => (
                  <span
                    key={day.date}
                    className={cn(
                      "min-w-0 flex-1 text-center",
                      day.day !== 1 && day.day % 7 !== 0 && day.day !== report.days.length && "invisible",
                    )}
                  >
                    {day.day}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <ul aria-label="Categories in chart" className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
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

          <div className="sr-only">
            <table>
              <caption>
                Daily spending values for {report.period}. Amounts are in PHP.
                Total spending includes all Transactions, including
                Uncategorized Transactions. Budgeted Spending includes
                Transactions in Categories with a current monthly Budget.
                {visibleBudgetPace
                  ? ` The daily Budget pace is ${budgetPaceLabel}; it is a pace guide, not a daily limit.`
                  : ""}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Total spending</th>
                  <th scope="col">Budgeted Spending</th>
                  {report.categories.map((category) => (
                    <th key={category.id ?? "uncategorized"} scope="col">
                      {category.label}
                    </th>
                  ))}
                  {visibleBudgetPace ? (
                    <th scope="col">Daily Budget pace</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => {
                  const amountByCategory = new Map(
                    day.categories.map(({ categoryId, amountCents }) => [
                      categoryId,
                      amountCents,
                    ]),
                  );

                  return (
                    <tr key={day.date}>
                      <th scope="row">{day.day}</th>
                      <td>{formatMoney(centsToMoney(day.spendingCents))}</td>
                      <td>
                        {formatMoney(centsToMoney(day.budgetedSpendingCents))}
                      </td>
                      {report.categories.map((category) => (
                        <td key={category.id ?? "uncategorized"}>
                          {formatMoney(
                            centsToMoney(amountByCategory.get(category.id) ?? 0),
                          )}
                        </td>
                      ))}
                      {visibleBudgetPace ? (
                        <td>
                          {formatMoney(centsToMoney(report.dailyBudgetPaceCents))}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </figure>
      </CardContent>
    </Card>
  );
}

export { DailySpendingChart };
