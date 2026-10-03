import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatExactMoney } from "@/shared/money";
import { formatReportingPeriod, type ReportingPeriod } from "@/shared/reporting-period";
import { PATTERN_WINDOW_MONTHS, PATTERN_MINIMUM_MONTHS, PATTERN_MULTIPLIER, PATTERN_MINIMUM_INCREASE_CENTS, type PatternTransaction, type SpendingPatterns } from "./spending-patterns";

const formatPatternAmount = (cents: number) => formatExactMoney((cents / 100).toFixed(Number.isInteger(cents) ? 2 : 3));

function Contributions({ transactions }: { readonly transactions: readonly PatternTransaction[] }) {
  return <ul className="grid gap-2 text-sm">
    {transactions.map((transaction) => <li key={transaction.id} className="grid gap-1 border-t border-border pt-2 sm:grid-cols-2">
      <span className="break-words">{transaction.description}</span>
      <span className="font-mono tabular-nums">{transaction.date} · {formatPatternAmount(transaction.amountCents)}</span>
    </li>)}
    {transactions.length === 0 && <li>No Category spending recorded through this cutoff.</li>}
  </ul>;
}

interface SpendingPatternEvidenceProps {
  readonly report: SpendingPatterns;
  readonly period: ReportingPeriod;
  readonly onViewTransactions?: (categoryId: string, period: ReportingPeriod) => void;
}

function SpendingPatternEvidence({ report, period, onViewTransactions }: SpendingPatternEvidenceProps) {
  return <section aria-label="Potential spending patterns" className="mb-5">
    <Card>
      <CardHeader><CardTitle>Spending changes</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <p>Comparison window: {formatReportingPeriod(report.windowStart)}–{formatReportingPeriod(report.windowEnd)}. {report.dayCutoff === null ? "Full calendar months." : `Through day ${report.dayCutoff} of each month, clamped to the last day of shorter months.`} Selected cutoff: {report.selectedCutoff}.</p>
        <p className="text-muted-foreground">The median is the middle recorded amount after sorting. Requires at least {PATTERN_MINIMUM_MONTHS} months with positive recorded Category spending in this {PATTERN_WINDOW_MONTHS}-month window. A potential pattern requires at least {PATTERN_MULTIPLIER} times the median and at least {formatPatternAmount(PATTERN_MINIMUM_INCREASE_CENTS)} above it. Empty months are omitted. These signals describe recorded spending; absence of a signal does not prove normal spending or complete coverage.</p>
        {report.future && <p>Future Reporting Period: comparison evidence is unavailable.</p>}
        {report.categories.length === 0 && <p>Insufficient recorded history. No Category comparisons are available.</p>}
        {report.categories.map((pattern) => <details key={pattern.category.id} className="min-w-0 border border-border p-3">
          <summary className="min-h-11 cursor-pointer break-words font-semibold focus-visible:outline-2 focus-visible:outline-ring">
            {pattern.category.label} · {pattern.status === "potential" ? "Potential increase in recorded spending" : pattern.status === "insufficient" ? "Insufficient recorded history" : "No potential increase meets both thresholds"}
          </summary>
          <div className="mt-3 grid gap-3">
            <p className="font-mono tabular-nums">Selected recorded amount: {formatPatternAmount(pattern.selectedCents)} · {pattern.comparisons.length} contributing months</p>
            {pattern.medianCents !== null ? <p className="font-mono tabular-nums">Median: {formatPatternAmount(pattern.medianCents)} · Change: {formatPatternAmount(pattern.selectedCents - pattern.medianCents)} ({((pattern.selectedCents / pattern.medianCents - 1) * 100).toFixed(2)}%) · {(pattern.selectedCents / pattern.medianCents).toFixed(3)} times the median</p> : <p>Insufficient recorded history: {pattern.comparisons.length} of the required {PATTERN_MINIMUM_MONTHS} positive comparison months. Earlier months outside this window are not used.</p>}
            <h3 className="font-semibold">Selected-month contributing Transactions</h3>
            <Contributions transactions={pattern.selectedTransactions} />
            {onViewTransactions && <Button className="min-h-11 h-auto whitespace-normal py-2" id={`insights-pattern-${pattern.category.id}`} variant="outline" aria-label={`Investigate ${pattern.category.label} selected-month Transactions`} onClick={() => onViewTransactions(pattern.category.id, period)}>View selected-month Transactions</Button>}
            <h3 className="font-semibold">Contributing comparison months</h3>
            {pattern.comparisons.map((month) => <details key={month.period} className="border-t border-border pt-2">
              <summary className="min-h-11 cursor-pointer font-mono tabular-nums focus-visible:outline-2 focus-visible:outline-ring">{formatReportingPeriod(month.period)} · {formatPatternAmount(month.amountCents)} · through {month.cutoff}</summary>
              <div className="mt-2 grid gap-2">
                <Contributions transactions={month.transactions} />
                {onViewTransactions && <Button className="min-h-11 h-auto whitespace-normal py-2" id={`insights-pattern-${pattern.category.id}-${month.period}`} variant="outline" aria-label={`Investigate ${pattern.category.label} ${formatReportingPeriod(month.period)} Transactions`} onClick={() => onViewTransactions(pattern.category.id, month.period)}>View full month’s Transactions</Button>}
              </div>
            </details>)}
          </div>
        </details>)}
      </CardContent>
    </Card>
  </section>;
}

export { SpendingPatternEvidence };
