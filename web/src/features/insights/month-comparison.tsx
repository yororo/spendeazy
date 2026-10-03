import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { centsToMoney, formatMoney } from "@/shared/money";
import {
  formatReportingPeriod,
  type ReportingPeriod,
} from "@/shared/reporting-period";
import type { InsightsMonthlyReport } from "./insights-service";
import type { ReactNode } from "react";

const money = (cents: number) => formatMoney(centsToMoney(cents));

function getMonthComparison(report: InsightsMonthlyReport) {
  const index = report.months.findIndex(
    (month) => month.period === report.period,
  );
  const selected = report.months[index]!;
  const previous = report.months[index - 1];
  const cutoff = report.spendingPatterns.dayCutoff;
  const recordedAmount = (period: ReportingPeriod) =>
    report.transactions
      .filter(
        (transaction) =>
          transaction.date.startsWith(period) &&
          (cutoff === null || Number(transaction.date.slice(8, 10)) <= cutoff),
      )
      .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const selectedCents =
    cutoff === null
      ? selected.totalSpendingCents
      : recordedAmount(selected.period);
  const previousCents = previous
    ? cutoff === null
      ? previous.totalSpendingCents
      : recordedAmount(previous.period)
    : 0;
  return {
    selected,
    previous,
    selectedCents,
    previousCents,
    changeCents: selectedCents - previousCents,
    cutoff,
  };
}

function MonthComparison({
  report,
  children,
}: {
  readonly report: InsightsMonthlyReport;
  readonly children: ReactNode;
}) {
  const {
    selected,
    previous,
    selectedCents,
    previousCents,
    changeCents,
    cutoff,
  } = getMonthComparison(report);
  const amounts = [
    { period: selected.period, amount: selectedCents },
    ...(previous ? [{ period: previous.period, amount: previousCents }] : []),
  ];
  return (
    <section aria-label="Month comparison">
      <Card>
        <CardHeader>
          <h2 className="font-mono text-xl font-bold">Compare Spending</h2>
          <p className="text-sm text-muted-foreground">
            How does this month compare with last month?
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          {report.spendingPatterns.future ? (
            <p className="text-sm">
              A spending comparison is unavailable for a future month.
            </p>
          ) : (
            <>
              <p className="text-xl font-semibold">
                {!previous || previousCents === 0
                  ? "More recorded history is needed to compare months"
                  : changeCents === 0
                    ? "Recorded spending is the same as last month"
                    : `${money(Math.abs(changeCents))} ${changeCents > 0 ? "more" : "less"} than last month`}
              </p>
              <p className="text-sm text-muted-foreground">
                {previousCents > 0 &&
                  `${Math.abs((changeCents / previousCents) * 100).toFixed(1)}% ${changeCents > 0 ? "increase" : changeCents < 0 ? "decrease" : "change"} · `}
                {cutoff === null
                  ? "Full calendar months · recorded expenses"
                  : `Through day ${cutoff} of each month, clamped to shorter months · recorded expenses`}
              </p>
              <div
                role="group"
                aria-label="Recorded month comparison amounts"
                className="grid gap-4 sm:grid-cols-2"
              >
                {amounts.map(({ period, amount }) => (
                  <div
                    key={period}
                    className="border border-border bg-muted p-4"
                  >
                    <p className="text-sm text-muted-foreground">
                      {formatReportingPeriod(period)}
                    </p>
                    <p className="mt-1 font-mono text-xl tabular-nums">
                      {money(amount)}
                    </p>
                    <div
                      aria-hidden="true"
                      className="mt-3 h-2 overflow-hidden rounded-[var(--radius)] bg-border"
                    >
                      <div
                        className="h-full rounded-[var(--radius)] bg-chart"
                        style={{
                          width: `${(amount / Math.max(1, selectedCents, previousCents)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {previousCents === 0
                  ? "No spending is recorded for the previous comparison period; that does not establish a zero-spending month."
                  : "Based on recorded expenses; your statements may not cover every expense."}
              </p>
            </>
          )}
          <details>
            <summary className="focus-ledger min-h-11 cursor-pointer py-3 text-sm font-semibold">
              Explore the last 12 months +
            </summary>
            <div className="grid gap-5 pt-3">{children}</div>
          </details>
        </CardContent>
      </Card>
    </section>
  );
}

export { MonthComparison };
