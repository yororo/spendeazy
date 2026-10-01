import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { describeBudget, getBudgetStatus } from "@/shared/budget";
import { getCategoryColorClass } from "@/shared/category";
import { centsToMoney, formatMoney } from "@/shared/money";
import { formatReportingPeriod, getCurrentReportingPeriod, getReportingPeriodBounds, type ReportingPeriod } from "@/shared/reporting-period";
import { MetricCard } from "@/shared/ui";
import type { InsightsMonthlyReport } from "./insights-service";

interface SelectedMonthSummaryProps {
  readonly report: InsightsMonthlyReport;
  readonly onViewTransactions?: (categoryId: string | undefined, period: ReportingPeriod) => void;
  readonly onEditBudget?: (categoryId: string, period: ReportingPeriod) => void;
  readonly onManageBudgets?: () => void;
}

function SelectedMonthSummary({ report, onViewTransactions, onEditBudget, onManageBudgets }: SelectedMonthSummaryProps) {
  const month = report.months.find(({ period }) => period === report.period)!;
  const current = report.period === getCurrentReportingPeriod();
  const elapsedDays = new Date().getDate();
  const daysInPeriod = getReportingPeriodBounds(report.period).daysInPeriod;
  const elapsed = Math.round(elapsedDays / daysInPeriod * 100);
  const usage = report.monthlyBudgetCents > 0 ? month.budgetedSpendingCents / report.monthlyBudgetCents * 100 : 0;
  const money = (cents: number) => formatMoney(centsToMoney(cents));
  const attention = report.selectedMonthCategories.filter(({ spendingCents, monthlyBudgetCents }) =>
    monthlyBudgetCents !== null && getBudgetStatus(spendingCents, monthlyBudgetCents) !== "within");
  const unbudgeted = report.selectedMonthCategories.filter(({ monthlyBudgetCents, spendingCents }) => monthlyBudgetCents === null && spendingCents > 0);
  return <section aria-label="Selected-month recorded spending" className="mb-5 grid gap-4">
    <h2 id="insights-recorded-spending" tabIndex={-1} className="font-mono text-xl font-bold">{formatReportingPeriod(report.period)} · Recorded spending</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="Total recorded spending" value={money(month.totalSpendingCents)} detail="All recorded expenses, including Uncategorized" emphasized />
      <MetricCard label="Budgeted Spending" value={money(month.budgetedSpendingCents)} detail="Categories with current monthly Budgets" />
      <MetricCard label="Unbudgeted Spending" value={money(month.totalSpendingCents - month.budgetedSpendingCents)} detail="No monthly Budget, including Uncategorized" />
    </div>
    <Card><CardContent className="grid gap-3 p-4 text-sm">
      {report.monthlyBudgetCents > 0 ? <>
        <p className="font-mono tabular-nums">Recorded Budget usage: {Math.round(usage)}% · {describeBudget(month.budgetedSpendingCents, report.monthlyBudgetCents)}</p>
        <Progress aria-label="Recorded Budget usage" value={Math.min(100, usage)} />
      </> : <p>No monthly Budgets set. Set a Budget to compare recorded spending with a limit.</p>}
      {current ? <><p>Elapsed month: {elapsed}% · {elapsedDays} of {daysInPeriod} days</p><Progress aria-label="Elapsed month" value={elapsed} /></> : <p>Actual historical recorded spending. Comparisons use current monthly limits.</p>}
      {month.totalSpendingCents === 0 && <p>No spending recorded for this month. View Transactions to record an expense.</p>}
      {onManageBudgets && <Button variant="outline" onClick={onManageBudgets}>Manage Budgets</Button>}
      {onViewTransactions && <Button id="insights-transactions-all" variant="outline" aria-label="View selected-month Transactions" onClick={() => onViewTransactions(undefined, report.period)}>View Transactions</Button>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Category attention</CardTitle></CardHeader><CardContent className="grid gap-4">
      {attention.length === 0 && <p className="text-sm text-muted-foreground">No recorded Category spending is nearing or exceeding a current monthly limit.</p>}
      {[...attention, ...unbudgeted].map((category) => <div key={category.id} className="grid gap-2 border-t border-border pt-3">
        <h3 className="flex items-center gap-2 font-semibold">{category.color && <span aria-hidden="true" className={`size-3 shrink-0 ${getCategoryColorClass(category.color)}`} />}{category.label}</h3>
        <p className={`font-mono tabular-nums ${category.monthlyBudgetCents !== null && getBudgetStatus(category.spendingCents, category.monthlyBudgetCents) === "over" ? "text-sm text-destructive" : "text-sm text-warning"}`}>
          {money(category.spendingCents)} recorded · {category.monthlyBudgetCents === null ? "No monthly Budget" : describeBudget(category.spendingCents, category.monthlyBudgetCents)}
        </p>
        <div className="flex flex-wrap gap-2">
          {onViewTransactions && <Button id={`insights-transactions-${category.id}`} variant="outline" aria-label={`View ${category.label} Transactions`} onClick={() => onViewTransactions(category.id!, report.period)}>View Transactions</Button>}
          {onEditBudget && <Button variant="outline" aria-label={`${category.monthlyBudgetCents === null ? "Set" : "Edit"} ${category.label} Budget`} onClick={() => onEditBudget(category.id!, report.period)}>{category.monthlyBudgetCents === null ? "Set Budget" : "Edit Budget"}</Button>}
        </div>
      </div>)}
    </CardContent></Card>
  </section>;
}

export { SelectedMonthSummary };
