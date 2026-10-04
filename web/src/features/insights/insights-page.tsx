import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { BudgetReviewHistory } from "@/shared/budget";
import { capturePageScroll, restorePageScroll, type PageScrollPosition } from "@/shared/ui/page-scroll";
import { restoreActionFocus } from "@/shared/ui/restore-action-focus";
import { FeatureDataError, FeatureDataLoading } from "@/shared/ui/feature-data-state";
import { ActiveSpaceLabel } from "@/shared/ui";
import { useAccessibleSpacesQuery } from "@/shared/api";
import { getCategoryColorOption } from "@/shared/category";
import { centsToMoney, formatMoney } from "@/shared/money";
import { ReportingPeriodFilter, useReportingPeriod, formatReportingPeriod, type ReportingPeriod } from "@/shared/reporting-period";
import { SpendingInspection } from "./spending-inspection";
import { useInsightsQuery, type InsightsView } from "./insights-queries";
import type { CategoryExplorerState } from "./category-explorer";
import type { InsightsCategory, InsightsMonthlyReport } from "./insights-service";

interface InsightsReturnContext {
  readonly scroll: PageScrollPosition;
  readonly focusId: string;
  readonly view?: InsightsView;
  readonly explorer?: CategoryExplorerState;
  readonly period?: ReportingPeriod;
  readonly spaceId?: string;
}
interface InsightsPageProps {
  readonly returnContext?: InsightsReturnContext;
  readonly spaceId?: string;
  readonly onSpaceChange?: (spaceId?: string) => void;
  readonly onManageBudgets?: () => void;
  readonly onViewTransactions?: (categoryId: string | undefined, period: ReportingPeriod, spaceId?: string, origin?: InsightsReturnContext) => void;
  readonly onEditBudget?: (categoryId: string, period: ReportingPeriod, spaceId?: string, evidence?: BudgetReviewHistory, returnFocusId?: string) => void;
}
const money = (cents: number) => formatMoney(centsToMoney(cents));
const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const categoryColor = (category: InsightsCategory) => category.color === null ? "var(--muted-foreground)" : `var(--category-${getCategoryColorOption(category.color).value})`;
const controlClass = "focus-ledger min-h-11 rounded-[var(--radius)] border border-border px-3 text-sm";

function ChartHelp({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const hoverDismissal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hoverDismissal.current), []);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (pinned || hovered || focused);
  return <div className="static" onPointerEnter={() => { clearTimeout(hoverDismissal.current); setHovered(true); setDismissed(false); }} onPointerLeave={() => { hoverDismissal.current = setTimeout(() => setHovered(false), 200); }} onKeyDown={event => { if (event.key === "Escape") { trigger.current?.focus(); setPinned(false); setDismissed(true); } }}>
    <button ref={trigger} type="button" aria-label={`About ${title}`} aria-expanded={open} aria-describedby={open ? id : undefined} className="focus-ledger flex size-11 items-center justify-center rounded-[var(--radius)]" onFocus={() => { setFocused(true); setDismissed(false); }} onBlur={event => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setFocused(false); }} onClick={() => { setPinned(!pinned); setDismissed(pinned); }}><Info aria-hidden="true" size={16} /></button>
    {open && <div id={id} role={pinned ? "dialog" : "tooltip"} aria-label={pinned ? `About ${title}` : undefined} className="absolute left-0 top-full z-20 w-64 max-w-full rounded-[var(--radius)] border border-border bg-popover p-3 text-sm font-normal text-popover-foreground shadow-md">{children}<button type="button" className={`${controlClass} mt-2 w-full`} onClick={() => { trigger.current?.focus(); setPinned(false); setDismissed(true); }}>Dismiss help</button></div>}
  </div>;
}
function ChartHeading({ id, title, help, budget, enabled, onBudgetChange }: { id: string; title: string; help: string; budget: boolean; enabled: boolean; onBudgetChange: (value: boolean) => void }) {
  return <header className="relative mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"><div className="flex min-w-0 items-center"><h2 id={id} tabIndex={-1} className="font-[family-name:var(--heading-font)] text-lg font-semibold">{title}</h2><ChartHelp id={`${id}-help`} title={title.toLowerCase()}>{help}</ChartHelp></div><label className={`${controlClass} flex items-center gap-2`}><input type="checkbox" checked={budget && enabled} disabled={!enabled} onChange={event => onBudgetChange(event.target.checked)} />Show budget</label></header>;
}
function LedgerCharts({ report, onInspect }: { report: InsightsMonthlyReport; onInspect: (point: string, triggerId: string) => void }) {
  const [totalBudget, setTotalBudget] = useState(true);
  const [categoryBudget, setCategoryBudget] = useState(true);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string> | null>(null);
  const [retainedMonth, setRetainedMonth] = useState<string | null>(null);
  const [hoverMonth, setHoverMonth] = useState<string | null>(null);
  const [retainedCategory, setRetainedCategory] = useState<string | null>(null);
  const [hoverCategory, setHoverCategory] = useState<string | null>(null);
  const categories = report.selectableCategories.filter((category): category is InsightsCategory & { id: string } => category.id !== null);
  const defaults = new Set(categories.toSorted((a, b) => b.spendingCents - a.spendingCents || a.label.localeCompare(b.label)).slice(0, 3).map(category => category.id));
  const selected = selectedIds ?? defaults;
  const trends = categories.filter(category => selected.has(category.id));
  const hasBudget = report.monthlyBudgetCents > 0;
  const hasCategoryBudget = trends.some(category => category.monthlyBudgetCents !== null);
  const maximum = Math.max(100, ...report.months.map(month => month.totalSpendingCents), totalBudget && hasBudget ? report.monthlyBudgetCents : 0);
  const trendMaximum = Math.max(100, ...trends.flatMap(category => [...report.months.map(month => month.categories.find(amount => amount.categoryId === category.id)?.amountCents ?? 0), categoryBudget ? category.monthlyBudgetCents ?? 0 : 0]));
  const activeMonth = report.months.find(month => month.period === (hoverMonth ?? retainedMonth));
  const activeCategory = trends.find(category => category.id === (hoverCategory ?? retainedCategory));
  const patterns = new Map<string, string | undefined>();
  const colorCounts = new Map<string, number>();
  categories.forEach(category => { const color = category.color ?? "none"; const count = colorCounts.get(color) ?? 0; patterns.set(category.id, count === 0 ? undefined : ["6 3", "2 3", "8 3 2 3"][(count - 1) % 3]); colorCounts.set(color, count + 1); });
  function toggleCategory(id: string) {
    const next = new Set(selected);
    if (next.has(id)) { next.delete(id); if (retainedCategory === id) setRetainedCategory(null); if (hoverCategory === id) setHoverCategory(null); } else next.add(id);
    setSelectedIds(next);
  }
  const y = (amount: number) => 100 - amount / trendMaximum * 100;
  return <div className="grid gap-8" onKeyDown={event => { if (event.key === "Escape") { setRetainedMonth(null); setHoverMonth(null); setRetainedCategory(null); setHoverCategory(null); } }}>
    <section aria-labelledby="insights-monthly-spending-title">
      <ChartHeading id="insights-monthly-spending-title" title="Monthly total spending" budget={totalBudget} enabled={hasBudget} onBudgetChange={setTotalBudget} help="Twelve months of recorded spending stacked by Category, including Uncategorized and Unbudgeted Spending. The dashed guide uses current recurring monthly Budgets, not reconstructed historical limits. Over Budget markers compare Budgeted Spending only with those limits; equality is At Budget Limit." />
      {!hasBudget && <p className="text-sm text-muted-foreground">No current monthly Budget reference is available.</p>}
      {report.totalSpendingCents === 0 && <p role="status">No spending was recorded in this 12-month window.</p>}
      <div className="relative mt-4 flex h-64 gap-2">
        <div aria-hidden="true" className="flex w-20 shrink-0 flex-col justify-between pb-7 text-right font-mono text-xs tabular-nums text-muted-foreground">{[maximum, maximum / 2, 0].map(value => <span key={value}>{money(value)}</span>)}</div>
        <div className="relative flex min-w-0 flex-1 gap-1 border-b border-structure pb-7">
          {totalBudget && hasBudget && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-foreground" style={{ bottom: `calc(1.75rem + (100% - 1.75rem) * ${report.monthlyBudgetCents / maximum})` }} />}
          {report.months.map((month, index) => <div key={month.period} className="flex min-w-0 flex-1 flex-col justify-end"><button type="button" aria-label={`${formatReportingPeriod(month.period)}: ${money(month.totalSpendingCents)}${totalBudget && hasBudget && month.budgetedSpendingCents > report.monthlyBudgetCents ? ", Over Budget" : ""}`} aria-pressed={retainedMonth === month.period} className="focus-ledger relative flex h-full min-w-0 flex-col justify-end overflow-hidden rounded-t-[var(--chart-radius)]" onPointerEnter={event => { if (event.pointerType === "mouse") setHoverMonth(month.period); }} onPointerLeave={() => setHoverMonth(null)} onFocus={() => setHoverMonth(month.period)} onBlur={() => setHoverMonth(null)} onClick={() => { setRetainedMonth(month.period); setHoverMonth(null); }}>
            {totalBudget && hasBudget && month.budgetedSpendingCents > report.monthlyBudgetCents && <span aria-hidden="true" className="absolute top-0 w-full text-center font-bold text-warning">!</span>}
            {report.categories.toReversed().map(category => { const amount = month.categories.find(value => value.categoryId === category.id)?.amountCents ?? 0; return amount > 0 ? <span key={category.id ?? "uncategorized"} aria-hidden="true" style={{ height: `${amount / maximum * 100}%`, backgroundColor: categoryColor(category) }} className="block w-full" /> : null; })}
            {month.totalSpendingCents === 0 && <span aria-hidden="true" className="h-px w-full bg-muted-foreground" />}
          </button><span aria-hidden="true" className="absolute bottom-0 text-xs text-muted-foreground">{index % 3 === 0 || index === 11 ? monthLabel.format(new Date(`${month.period}-01T00:00:00Z`)) : ""}</span></div>)}
        </div>
      </div>
      <div className="mt-3 min-h-11" aria-live="polite">{activeMonth && <div className="flex flex-wrap items-center gap-3 text-sm"><span>{formatReportingPeriod(activeMonth.period)} · {money(activeMonth.totalSpendingCents)}</span><button className={controlClass} type="button" onClick={() => { setRetainedMonth(null); setHoverMonth(null); }}>Dismiss amount</button></div>}</div>
      <div aria-label="Monthly spending inspection" className="flex max-w-full gap-2 overflow-x-auto py-2">{report.months.map(month => <div key={month.period} className="flex shrink-0 flex-col gap-2"><button type="button" className={controlClass} aria-pressed={retainedMonth === month.period} onClick={() => { setRetainedMonth(month.period); setHoverMonth(null); }}>Select {monthLabel.format(new Date(`${month.period}-01T00:00:00Z`))} amount</button><button type="button" id={`insights-point-${month.period}`} className={`${controlClass} shrink-0`} onClick={() => onInspect(month.period, `insights-point-${month.period}`)}>Inspect {monthLabel.format(new Date(`${month.period}-01T00:00:00Z`))}</button></div>)}</div>
      <ul aria-label="Monthly spending Categories" className="mt-3 flex flex-wrap gap-4">{report.categories.map(category => <li key={category.id ?? "uncategorized"} className="flex items-center gap-2 text-sm"><span aria-hidden="true" className="size-3 rounded-[var(--radius)]" style={{ backgroundColor: categoryColor(category) }} />{category.label}</li>)}</ul>
    </section>
    <section aria-labelledby="insights-category-spending-title">
      <ChartHeading id="insights-category-spending-title" title="Spending by Category" budget={categoryBudget} enabled={hasCategoryBudget} onBudgetChange={setCategoryBudget} help="Monthly Category trends across twelve months. Choose Categories to compare. Dashed Budget guides use each selected Category’s current recurring monthly Budget, including historical comparisons; past limits are not reconstructed. Spending lines retain Category Colors and use different patterns when colors are shared." />
      {!hasCategoryBudget && <p className="text-sm text-muted-foreground">No selected Category has a current monthly Budget reference.</p>}
      <details className="my-4"><summary className="focus-ledger flex min-h-11 cursor-pointer items-center text-sm">Categories to compare · {trends.length} selected</summary><div role="group" aria-label="Categories to compare" className="flex flex-wrap gap-2">{categories.map(category => <button type="button" className={controlClass} key={category.id} aria-pressed={selected.has(category.id)} onClick={() => toggleCategory(category.id)}>{category.label}</button>)}</div></details>
      {trends.length === 0 ? <p role="status">{categories.length === 0 ? "No Categories are available to compare in this Space." : "Select a Category to see its spending trend."}</p> : <>
        {!trends.some(category => category.spendingCents > 0) && <p role="status">No spending was recorded for the selected Categories in this window.</p>}
        <div className="flex h-64 gap-2"><div aria-hidden="true" className="flex w-20 shrink-0 flex-col justify-between pb-7 text-right font-mono text-xs text-muted-foreground">{[trendMaximum, trendMaximum / 2, 0].map(value => <span key={value}>{money(value)}</span>)}</div><div className="flex min-w-0 flex-1 flex-col"><svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="min-h-0 w-full flex-1 border-b border-structure">
          {categoryBudget && trends.map(category => category.monthlyBudgetCents === null ? null : <line key={`${category.id}-budget`} x1={0} x2={100} y1={y(category.monthlyBudgetCents)} y2={y(category.monthlyBudgetCents)} stroke={categoryColor(category)} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" className="pointer-events-none opacity-60" />)}
          {trends.map(category => { const points = report.months.map((month, index) => `${index / 11 * 100},${y(month.categories.find(amount => amount.categoryId === category.id)?.amountCents ?? 0)}`).join(" "); return <g key={category.id}><polyline fill="none" points={points} stroke={categoryColor(category)} strokeDasharray={patterns.get(category.id)} strokeWidth={2} vectorEffect="non-scaling-stroke" className="pointer-events-none" /><polyline fill="none" points={points} stroke="transparent" strokeWidth={24} vectorEffect="non-scaling-stroke" className="cursor-pointer" onPointerEnter={event => { if (event.pointerType === "mouse") setHoverCategory(category.id); }} onPointerLeave={() => setHoverCategory(null)} onClick={() => { setRetainedCategory(category.id); setHoverCategory(null); }} /></g>; })}
        </svg><div aria-hidden="true" className="flex h-7 justify-between text-xs text-muted-foreground">{report.months.filter((_, index) => index % 3 === 0 || index === 11).map(month => <span key={month.period}>{monthLabel.format(new Date(`${month.period}-01T00:00:00Z`))}</span>)}</div></div></div>
        <ul aria-label="Selected Categories in trend chart" className="mt-3 flex flex-wrap gap-2">{trends.map(category => <li key={category.id}><button className={`${controlClass} flex items-center gap-2`} type="button" aria-pressed={retainedCategory === category.id} onFocus={() => setHoverCategory(category.id)} onBlur={() => setHoverCategory(null)} onClick={() => { setRetainedCategory(category.id); setHoverCategory(null); }}><svg aria-hidden="true" width="28" height="12"><line x1={0} x2={28} y1={6} y2={6} stroke={categoryColor(category)} strokeWidth={2} strokeDasharray={patterns.get(category.id)} /></svg>{category.label}</button></li>)}</ul>
        <div className="mt-3 min-h-11" aria-live="polite">{activeCategory && <div className="flex flex-wrap items-center gap-3 text-sm"><span>{activeCategory.label}</span><button className={controlClass} type="button" onClick={() => { setRetainedCategory(null); setHoverCategory(null); }}>Dismiss Category</button></div>}</div>
      </>}
    </section>
    <div className="sr-only"><table><caption>Monthly spending values. Historical references use current monthly Budgets.</caption><thead><tr><th scope="col">Reporting Period</th><th scope="col">Total spending</th><th scope="col">Budgeted Spending</th><th scope="col">Current monthly Budget</th>{trends.map(category => <th scope="col" key={category.id}>{category.label} spending / current monthly Budget</th>)}</tr></thead><tbody>{report.months.map(month => <tr key={month.period}><th scope="row">{formatReportingPeriod(month.period)}</th><td>{money(month.totalSpendingCents)}</td><td>{money(month.budgetedSpendingCents)}</td><td>{money(report.monthlyBudgetCents)}</td>{trends.map(category => <td key={category.id}>{money(month.categories.find(amount => amount.categoryId === category.id)?.amountCents ?? 0)} / {category.monthlyBudgetCents === null ? "No monthly Budget" : money(category.monthlyBudgetCents)}</td>)}</tr>)}</tbody></table></div>
  </div>;
}
function InsightsPage({ spaceId, onSpaceChange, onViewTransactions, onEditBudget, returnContext }: InsightsPageProps = {}) {
  const { period } = useReportingPeriod();
  const shouldResolvePersonalSpace = onSpaceChange !== undefined;
  const spacesQuery = useAccessibleSpacesQuery(shouldResolvePersonalSpace);
  const effectiveSpaceId = spaceId ?? spacesQuery.data?.find(space => space.kind === "personal")?.id;
  const insightsQuery = useInsightsQuery(period, effectiveSpaceId, !shouldResolvePersonalSpace || spacesQuery.isSuccess, "monthly");
  const restoredContext = useRef<InsightsReturnContext | undefined>(undefined);
  useEffect(() => {
    if (!returnContext || !insightsQuery.isSuccess || restoredContext.current === returnContext) return;
    const frame = requestAnimationFrame(() => { restoredContext.current = returnContext; restoreActionFocus(document.getElementById(returnContext.focusId) ?? document.getElementById("insights-monthly-spending-title")); restorePageScroll(returnContext.scroll); });
    return () => cancelAnimationFrame(frame);
  }, [returnContext, insightsQuery.isSuccess]);
  if (spacesQuery.isError) return <FeatureDataError message={spacesQuery.error.message} onRetry={() => void spacesQuery.refetch()} />;
  if (spacesQuery.isSuccess && !effectiveSpaceId) return <FeatureDataError message="Personal Space is unavailable." onRetry={() => void spacesQuery.refetch()} />;
  if (insightsQuery.isPending) return <FeatureDataLoading label="Loading Insights" />;
  if (insightsQuery.isError && !insightsQuery.data) return <FeatureDataError message={insightsQuery.error.message} onRetry={() => void insightsQuery.refetch()} />;
  if (!insightsQuery.data || insightsQuery.data.view !== "monthly") return null;
  const report = insightsQuery.data;
  return <div data-insights-view="monthly" className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b border-structure pb-5"><div><ActiveSpaceLabel spaceId={effectiveSpaceId} spaces={spacesQuery.data} /><h1 className="mt-2 font-[family-name:var(--heading-font)] text-2xl font-bold tracking-tight md:text-3xl">Insights</h1></div><div className="ml-auto w-48 max-w-full [&>div]:h-11 [&_input]:min-h-11 [&_button]:min-h-11 [&_button]:min-w-11"><ReportingPeriodFilter id="insights-reporting-period" /></div></header>
    {insightsQuery.isError && <FeatureDataError message={insightsQuery.error.message} onRetry={() => void insightsQuery.refetch()} />}
    <div aria-busy={insightsQuery.isFetching}><ScopedLedger key={`${effectiveSpaceId ?? "personal"}-${period}`} report={report} spaceId={effectiveSpaceId} onViewTransactions={onViewTransactions} onEditBudget={onEditBudget} /></div>
  </div>;
}
function ScopedLedger({ report, spaceId, onViewTransactions, onEditBudget }: { report: InsightsMonthlyReport } & Pick<InsightsPageProps, "spaceId" | "onViewTransactions" | "onEditBudget">) {
  const [inspection, setInspection] = useState<{ point: string; triggerId: string; open: boolean } | null>(null);
  const inspectPoint = (point: string, triggerId = `insights-point-${point}`) => setInspection({ point, triggerId, open: true });
  return <><LedgerCharts report={report} onInspect={inspectPoint} /><SpendingInspection report={report} point={inspection?.point} triggerId={inspection?.triggerId} open={inspection?.open ?? false} onInspect={inspectPoint} onDismiss={() => setInspection(current => current ? { ...current, open: false } : null)} onViewTransactions={onViewTransactions ? (categoryId, selectedPeriod, focusId) => onViewTransactions(categoryId, selectedPeriod, spaceId, { view: "monthly", period: report.period, spaceId, focusId: focusId ?? "insights-monthly-spending-title", scroll: capturePageScroll() }) : undefined} onEditBudget={onEditBudget ? (categoryId, selectedPeriod, focusId) => onEditBudget(categoryId, selectedPeriod, spaceId, undefined, focusId) : undefined} /></>;
}
export { InsightsPage };
export type { InsightsReturnContext };
