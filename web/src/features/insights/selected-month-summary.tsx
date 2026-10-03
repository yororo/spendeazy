import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { describeBudget, getBudgetStatus } from "@/shared/budget";
import { centsToMoney, formatMoney } from "@/shared/money";
import {
  formatReportingPeriod,
  getCurrentReportingPeriod,
  getReportingPeriodBounds,
  type ReportingPeriod,
} from "@/shared/reporting-period";
import type { InsightsMonthlyReport } from "./insights-service";

interface SelectedMonthSummaryProps {
  readonly report: InsightsMonthlyReport;
  readonly onViewTransactions?: (
    categoryId: string | undefined,
    period: ReportingPeriod,
  ) => void;
  readonly onManageBudgets?: () => void;
}

const money = (cents: number) => formatMoney(centsToMoney(cents));

function SelectedMonthSummary({
  report,
  onViewTransactions,
  onManageBudgets,
}: SelectedMonthSummaryProps) {
  const month = report.months.find(({ period }) => period === report.period)!;
  const current = report.period === getCurrentReportingPeriod();
  const elapsedDays = new Date().getDate();
  const daysInPeriod = getReportingPeriodBounds(report.period).daysInPeriod;
  const elapsed = Math.round((elapsedDays / daysInPeriod) * 100);
  const usage =
    report.monthlyBudgetCents > 0
      ? (month.budgetedSpendingCents / report.monthlyBudgetCents) * 100
      : 0;
  const status =
    report.monthlyBudgetCents > 0
      ? getBudgetStatus(month.budgetedSpendingCents, report.monthlyBudgetCents)
      : null;
  const attentionCount = report.selectedMonthCategories.filter(
    ({ spendingCents, monthlyBudgetCents }) =>
      monthlyBudgetCents !== null &&
      getBudgetStatus(spendingCents, monthlyBudgetCents) !== "within",
  ).length;

  return (
    <section aria-label="Selected-month recorded spending">
      <Card>
        <CardHeader>
          <h2
            className="font-mono text-xl font-bold"
            id="insights-recorded-spending"
            tabIndex={-1}
          >
            Budget Overview
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatReportingPeriod(report.period)}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
            <div
              className={`rounded-[var(--radius)] border-l-4 bg-muted p-4 ${status === "over" ? "border-destructive" : "border-structure"}`}
            >
              <p className="text-lg font-semibold">
                {status === null
                  ? "No monthly Budgets set"
                  : status === "over"
                    ? `${money(month.budgetedSpendingCents - report.monthlyBudgetCents)} over your monthly limits`
                    : status === "limit"
                      ? "At your monthly Budget limit"
                      : `${money(report.monthlyBudgetCents - month.budgetedSpendingCents)} remaining in monthly Budgets`}
              </p>
              {status !== null ? (
                <>
                  <p className="mt-2 text-sm">
                    <span className="font-mono tabular-nums">
                      {money(month.budgetedSpendingCents)}
                    </span>{" "}
                    Budgeted Spending /{" "}
                    <span className="font-mono tabular-nums">
                      {money(report.monthlyBudgetCents)}
                    </span>{" "}
                    monthly limits
                  </p>
                  <Progress
                    className={`mt-3 ${status === "over" ? "[&>[data-slot=progress-indicator]]:bg-destructive" : ""}`}
                    aria-label="Recorded Budget usage"
                    value={Math.min(100, usage)}
                    getValueLabel={() =>
                      `${usage.toFixed(1)}% of monthly limits used`
                    }
                  />
                  <p className="mt-2 text-sm">
                    {usage.toFixed(1)}% used · {attentionCount}{" "}
                    {attentionCount === 1
                      ? "Category needs"
                      : "Categories need"}{" "}
                    attention
                  </p>
                  <p className="mt-2 text-sm">
                    {describeBudget(
                      month.budgetedSpendingCents,
                      report.monthlyBudgetCents,
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm">
                  Set a monthly Budget to compare recorded spending with a
                  limit.
                </p>
              )}
            </div>
            <div className="grid content-center gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total recorded spending
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                  {money(month.totalSpendingCents)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Includes{" "}
                <span className="font-mono tabular-nums">
                  {money(
                    month.totalSpendingCents - month.budgetedSpendingCents,
                  )}
                </span>{" "}
                Unbudgeted Spending, including Uncategorized expenses. Only
                Budgeted Spending is compared with monthly limits.
              </p>
            </div>
          </div>
          {current ? (
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>
                Elapsed month: {elapsed}% · {elapsedDays} of {daysInPeriod} days
              </p>
              <Progress aria-label="Elapsed month" value={elapsed} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {report.spendingPatterns.future
                ? "Future Reporting Period: spending shown is recorded, not a forecast."
                : "Actual historical recorded spending. Comparisons use current monthly limits."}
            </p>
          )}
          {month.totalSpendingCents === 0 && (
            <p className="text-sm">
              No spending recorded for this month. View Transactions to record
              an expense.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {onManageBudgets && (
              <Button
                className="min-h-11"
                variant="outline"
                onClick={onManageBudgets}
              >
                Manage Budgets
              </Button>
            )}
            {onViewTransactions && (
              <Button
                className="min-h-11"
                id="insights-transactions-all"
                variant="outline"
                aria-label="View selected-month Transactions"
                onClick={() => onViewTransactions(undefined, report.period)}
              >
                View Transactions
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export { SelectedMonthSummary };
