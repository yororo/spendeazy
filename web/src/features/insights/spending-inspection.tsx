import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { describeBudget } from "@/shared/budget";
import { centsToMoney, formatMoney } from "@/shared/money";
import { formatReportingPeriod, parseReportingPeriod, useReportingPeriod, type ReportingPeriod } from "@/shared/reporting-period";
import type { InsightsReportResult } from "./insights-service";

interface SpendingInspectionProps {
  readonly report: InsightsReportResult;
  readonly point?: string;
  readonly open: boolean;
  readonly triggerId?: string;
  readonly onInspect: (point: string, triggerId: string) => void;
  readonly onDismiss: () => void;
  readonly onViewTransactions?: (categoryId: string | undefined, period: ReportingPeriod, focusId?: string) => void;
  readonly onEditBudget?: (categoryId: string, period: ReportingPeriod, focusId?: string) => void;
}

function SpendingInspection({ report, point, open, triggerId, onInspect, onDismiss, onViewTransactions, onEditBudget }: SpendingInspectionProps) {
  const { setPeriod } = useReportingPeriod();
  const initialPoint = report.view === "monthly" ? report.period : report.days[0]!.date;
  const [selected, setSelected] = useState<string>(point ?? initialPoint);
  const points = report.view === "monthly" ? report.months.map(month => ({ key: month.period, label: formatReportingPeriod(month.period) })) : report.days.map(day => ({ key: day.date, label: day.date }));
  const chosen = open ? point ?? selected : selected;
  const key = points.some(point => point.key === chosen) ? chosen : initialPoint;
  const period = parseReportingPeriod(key.slice(0, 7))!;
  const transactions = report.transactions.filter(transaction => report.view === "monthly" ? transaction.date.slice(0, 7) === key : transaction.date.slice(0, 10) === key);
  const budgetedIds = new Set(report.selectableCategories.filter(category => category.monthlyBudgetCents !== null).map(category => category.id));
  const budgeted = transactions.filter(transaction => budgetedIds.has(transaction.categoryId)).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const total = transactions.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const categories = [...report.selectableCategories, ...report.categories.filter(category => category.id === null)];
  return <div className="mt-4 grid gap-3 border-t border-border pt-4">
    <label className="grid gap-2 text-sm">Inspect recorded spending
      <select aria-label="Spending point" className="min-h-10 w-full border border-border bg-background px-2" value={key} onChange={event => setSelected(event.target.value)}>
        {points.map(point => <option key={point.key} value={point.key}>{point.label}</option>)}
      </select>
    </label>
    <Dialog open={open} onOpenChange={nextOpen => { if (nextOpen) onInspect(selected, "insights-inspect-spending"); else onDismiss(); }}>
      <DialogTrigger asChild><Button id="insights-inspect-spending" variant="outline">Inspect {report.view === "monthly" ? formatReportingPeriod(period) : key}</Button></DialogTrigger>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); (document.getElementById(triggerId ?? "insights-inspect-spending") ?? document.getElementById("insights-inspect-spending"))?.focus(); }}>
        <DialogHeader><DialogTitle>{report.view === "monthly" ? formatReportingPeriod(period) : key} recorded spending</DialogTitle><DialogDescription>Recorded contributions explain this point independently of potential-pattern signals. Inspection preserves your Reporting Period.</DialogDescription></DialogHeader>
        <div className="grid min-w-0 gap-4 p-5">
          <p className="font-mono">Total: {formatMoney(centsToMoney(total))}</p>
          <p className="font-mono">Budgeted Spending: {formatMoney(centsToMoney(budgeted))}</p>
          <p className="font-mono">Unbudgeted Spending: {formatMoney(centsToMoney(total - budgeted))}</p>
          <p className="text-sm text-muted-foreground">Budget states compare the full inspected month with current monthly Budgets; they are not daily limits.</p>
          {categories.map(category => {
            const contributions = transactions.filter(transaction => transaction.categoryId === category.id);
            if (!contributions.length) return null;
            const monthAmount = report.transactions.filter(transaction => transaction.categoryId === category.id && transaction.date.slice(0, 7) === period).reduce((sum, transaction) => sum + transaction.amountCents, 0);
            return <section key={category.id ?? "uncategorized"} className="grid gap-2 border-t border-border pt-3">
              <h3 className="break-words font-semibold">{category.label} · {formatMoney(centsToMoney(contributions.reduce((sum, transaction) => sum + transaction.amountCents, 0)))}</h3>
              <p className="text-sm">{category.monthlyBudgetCents === null ? "No monthly Budget" : describeBudget(monthAmount, category.monthlyBudgetCents)}</p>
              <ul className="grid gap-2 text-sm">{contributions.map(transaction => <li key={transaction.id} className="break-words">{transaction.date.slice(0, 10)} · {transaction.description} · {formatMoney(centsToMoney(transaction.amountCents))}</li>)}</ul>
              {onViewTransactions && <Button variant="outline" onClick={() => onViewTransactions(category.id ?? "uncategorized", period, triggerId)}>View {category.label} month’s Transactions</Button>}
              {onEditBudget && category.id && <Button variant="outline" onClick={() => { onDismiss(); onEditBudget(category.id!, period, triggerId); }}>{category.monthlyBudgetCents === null ? "Set" : "Edit"} {category.label} Budget</Button>}
            </section>;
          })}
          {!transactions.length && <p>No spending recorded for this point.</p>}
          <Button onClick={() => { onDismiss(); setPeriod(period); }}>View this month</Button>
          {onViewTransactions && <Button variant="outline" onClick={() => onViewTransactions(undefined, period, triggerId)}>View full month’s Transactions</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
export { SpendingInspection };
