import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { describeBudget } from "@/shared/budget";
import { getCategoryColorClass } from "@/shared/category";
import { centsToMoney, formatMoney } from "@/shared/money";
import { formatReportingPeriod } from "@/shared/reporting-period";

import type {
  InsightsDailyReport,
  InsightsMonthlyReport,
} from "./insights-service";

interface MonthlyCategoryRankingsProps {
  readonly report: InsightsDailyReport | InsightsMonthlyReport;
}

function MonthlyCategoryRankings({ report }: MonthlyCategoryRankingsProps) {
  const selectedMonth = formatReportingPeriod(report.period);

  return (
    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card variant="strong" className="flex flex-col">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle id="insights-frequent-breaches-title">
              Frequently over Budget
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Months over Budget in the 12-month window ending {selectedMonth}.
            </p>
          </div>
          <span className="shrink-0 bg-primary px-2 py-1 font-mono text-xs font-bold text-primary-foreground">
            TOP 5
          </span>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Historical comparisons use current monthly Budgets. The selected
            month counts when spending has already exceeded its Budget.
          </p>
          {report.frequentlyOverBudget.length > 0 ? (
            <ol
              aria-label="Categories with the most monthly Budget breaches"
              className="divide-y divide-border"
            >
              {report.frequentlyOverBudget.map((category, index) => (
                <li
                  key={category.categoryId}
                  className="flex min-h-14 flex-wrap items-center gap-3 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="w-7 shrink-0 font-mono text-sm text-muted-foreground"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3 shrink-0",
                      getCategoryColorClass(category.color),
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {category.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Current monthly Budget {formatMoney(centsToMoney(category.monthlyBudgetCents))}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                    <span aria-hidden="true">{category.breachCount} / 12</span>
                    <span className="sr-only">
                      {category.breachCount} of 12 months over Budget
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {report.monthlyBudgetedCategoryCount === 0
                ? "No monthly-budgeted Categories are available for comparison."
                : `No Categories exceeded their current Budget in the 12-month window ending ${selectedMonth}.`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card variant="strong" className="flex flex-col">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle id="insights-low-spending-title">
              Lowest spending
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Active monthly-budgeted Categories in {selectedMonth}, including
              zero spending.
            </p>
          </div>
          <span className="shrink-0 bg-primary px-2 py-1 font-mono text-xs font-bold text-primary-foreground">
            TOP 5
          </span>
        </CardHeader>
        <CardContent>
          {report.lowestSpending.length > 0 ? (
            <ol
              aria-label="Active monthly-budgeted Categories with the lowest spending"
              className="divide-y divide-border"
            >
              {report.lowestSpending.map((category, index) => (
                <li
                  key={category.categoryId}
                  className="flex min-h-14 flex-wrap items-center gap-3 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="w-7 shrink-0 font-mono text-sm text-muted-foreground"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3 shrink-0",
                      getCategoryColorClass(category.color),
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {category.label}
                  </span>
                  <span className="w-full min-w-0 text-right font-mono text-xs tabular-nums sm:w-auto sm:text-sm">
                    <span className="block">
                      {formatMoney(centsToMoney(category.spendingCents))} spent
                    </span>
                    <span className="block text-muted-foreground">
                      {formatMoney(centsToMoney(category.monthlyBudgetCents))} Budget
                    </span>
                    <span className="block text-warning">{describeBudget(category.spendingCents, category.monthlyBudgetCents)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {report.activeMonthlyBudgetedCategoryCount === 0
                ? "No active Categories have a current monthly Budget."
                : `No active monthly-budgeted Categories are available for ${selectedMonth}.`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export { MonthlyCategoryRankings };
