import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Info, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { BudgetReviewHistory } from "@/shared/budget";
import { capturePageScroll, restorePageScroll, type PageScrollPosition } from "@/shared/ui/page-scroll";
import { restoreActionFocus } from "@/shared/ui/restore-action-focus";
import { FeatureDataError, FeatureDataLoading } from "@/shared/ui/feature-data-state";
import { ActiveSpaceLabel } from "@/shared/ui";
import { useAccessibleSpacesQuery } from "@/shared/api";
import { getCategoryColorOption } from "@/shared/category";
import { centsToMoney, formatMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
  formatReportingPeriod,
  type ReportingPeriod,
} from "@/shared/reporting-period";

import { useInsightsQuery, type InsightsView } from "./insights-queries";
import { SpendingInspection } from "./spending-inspection";
import type { CategoryExplorerState } from "./category-explorer";
import type { InsightsCategory, InsightsMonth, InsightsMonthlyReport } from "./insights-service";

interface InsightsReturnContext {
  readonly scroll: PageScrollPosition;
  readonly focusId: string;
  readonly view?: InsightsView;
  readonly explorer?: CategoryExplorerState;
  readonly period?: ReportingPeriod;
  readonly spaceId?: string;
  readonly inspectionPoint?: string;
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
const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const fullMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const periodDate = (period: ReportingPeriod) => new Date(`${period}-01T00:00:00Z`);
const categoryColor = (category: InsightsCategory) => category.color === null
  ? "var(--muted-foreground)"
  : `var(--category-${getCategoryColorOption(category.color).value})`;
const controlClass = "focus-ledger min-h-11 rounded-md border border-border px-3 text-sm";
const chartDisclosureClass = `${controlClass} inline-flex cursor-pointer list-none items-center gap-2 bg-muted font-medium transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden`;
const categoryAmount = (month: InsightsMonth, categoryId: string | null) =>
  month.categories.find(amount => amount.categoryId === categoryId)?.amountCents ?? 0;
const HelpDismissalContext = createContext(0);

function ChartHelp({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const dismissal = useContext(HelpDismissalContext);
  const [openedAt, setOpenedAt] = useState(dismissal);
  const trigger = useRef<HTMLButtonElement>(null);
  const hoverDismissal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = openedAt === dismissal && !dismissed && (pinned || hovered || focused);
  useEffect(() => () => clearTimeout(hoverDismissal.current), []);

  function dismiss() {
    trigger.current?.focus();
    setPinned(false);
    setDismissed(true);
  }

  return (
    <div
      onPointerEnter={() => {
        clearTimeout(hoverDismissal.current);
        if (openedAt !== dismissal) setPinned(false);
        setOpenedAt(dismissal);
        setHovered(true);
        setDismissed(false);
      }}
      onPointerLeave={() => {
        hoverDismissal.current = setTimeout(() => setHovered(false), 200);
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); dismiss(); } }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`About ${title}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="focus-ledger flex size-11 shrink-0 items-center justify-center rounded-md"
        onFocus={() => {
          if (openedAt !== dismissal) setPinned(false);
          setOpenedAt(dismissal);
          setFocused(true);
          setDismissed(false);
        }}
        onClick={() => {
          const alreadyPinned = pinned && open;
          setOpenedAt(dismissal);
          setPinned(!alreadyPinned);
          setDismissed(alreadyPinned);
        }}
      >
        <Info aria-hidden="true" size={16} />
      </button>
      {open && (
        <div
          id={id}
          role={pinned ? "dialog" : "tooltip"}
          aria-label={pinned ? `About ${title}` : undefined}
          className="absolute left-0 top-full z-30 w-72 max-w-full rounded-md border border-border bg-popover p-3 text-sm font-normal text-popover-foreground shadow-md"
        >
          {children}
          {pinned && <button type="button" className={`${controlClass} mt-2 w-full`} onClick={dismiss}>Dismiss help</button>}
        </div>
      )}
    </div>
  );
}

function ChartHeading({ id, title, help, budget, enabled, onBudgetChange, children }: {
  id: string;
  title: string;
  help: string;
  budget: boolean;
  enabled: boolean;
  onBudgetChange: (value: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <header className="relative mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex min-w-0 max-w-full items-center">
        <h2 id={id} tabIndex={-1} className="min-w-0 font-mono text-lg font-semibold">
          {title}
        </h2>
        <ChartHelp id={`${id}-help`} title={title.toLowerCase()}>{help}</ChartHelp>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        {children}
        <div className="flex items-center gap-2 rounded-md border border-border px-3">
          <Checkbox
            id={`${id}-budget`}
            checked={budget && enabled}
            disabled={!enabled}
            onCheckedChange={value => onBudgetChange(value === true)}
          />
          <Label htmlFor={`${id}-budget`} className="flex min-h-11 cursor-pointer items-center text-sm font-normal normal-case tracking-normal">Show budget</Label>
        </div>
      </div>
    </header>
  );
}

const chartAmountStepCents = 10_000 * 100;
const chartMaximum = (amount: number) => Math.max(chartAmountStepCents, Math.ceil(amount * 1.05 / chartAmountStepCents) * chartAmountStepCents);

function ChartScale({ maximum }: { maximum: number }) {
  const tickStep = Math.ceil(maximum / 4 / chartAmountStepCents) * chartAmountStepCents;
  const ticks = [maximum];
  for (let value = Math.floor((maximum - 1) / tickStep) * tickStep; value >= 0; value -= tickStep) ticks.push(value);
  return (
    <div aria-hidden="true" className="relative w-20 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground sm:w-24">
      {ticks.map(value => (
        <span key={value} className="absolute right-0 break-all" style={{ top: `${(1 - value / maximum) * 100}%`, transform: value === maximum ? undefined : "translateY(-100%)" }}>{money(value)}</span>
      ))}
    </div>
  );
}

function MonthAxis({ months }: { months: readonly InsightsMonth[] }) {
  return (
    <div aria-hidden="true" className="absolute bottom-0 left-22 right-0 grid h-8 grid-cols-12 text-center font-mono text-xs text-muted-foreground sm:left-26">
      {months.map((month, index) => (
        <span key={month.period} className={`${index % 3 === 0 || index === months.length - 1 ? "" : "invisible"} ${index === 0 ? "text-left" : index === months.length - 1 ? "text-right" : ""}`}>
          <span className="block whitespace-nowrap">{shortMonth.format(periodDate(month.period))}</span>
          <span className="block whitespace-nowrap">{month.period.slice(0, 4)}</span>
        </span>
      ))}
    </div>
  );
}

function ChartPopup({ label, amountCents, x, y, below = false, retained, onDismiss }: {
  label: string;
  amountCents: number;
  x: number;
  y: number;
  below?: boolean;
  retained: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className={`absolute z-20 w-48 max-w-full rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md ${retained ? "" : "pointer-events-none"}`}
      style={{
        left: `clamp(0px, calc(5.5rem + (100% - 5.5rem) * ${x} - 6rem), calc(100% - 12rem))`,
        top: `clamp(0px, calc((100% - 2rem) * ${y} ${below ? "+ 0.75rem" : "- 6rem"}), calc(100% - 8rem))`,
      }}
    >
      <div className="flex items-start gap-1">
        <p className="min-w-0 flex-1 break-words text-xs">{label}</p>
        {retained && (
          <button type="button" aria-label="Dismiss chart details" className="focus-ledger -mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-md" onClick={onDismiss}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="break-all font-mono text-sm font-semibold tabular-nums">{money(amountCents)}</p>
    </div>
  );
}

function keyboardMonth(event: KeyboardEvent, current: number, count: number): number | null {
  switch (event.key) {
    case "ArrowLeft": case "ArrowDown": return Math.max(0, current - 1);
    case "ArrowRight": case "ArrowUp": return Math.min(count - 1, current + 1);
    case "Home": return 0;
    case "End": return count - 1;
    case "Enter": case " ": return current;
    default: return null;
  }
}

interface MonthPoint {
  readonly index: number;
  readonly y: number;
  readonly categoryId?: string | null;
  readonly below?: boolean;
}

function MonthlyTotalChart({ report }: { report: InsightsMonthlyReport }) {
  const [showBudget, setShowBudget] = useState(true);
  const [selection, setSelection] = useState<MonthPoint | null>(null);
  const [hover, setHover] = useState<MonthPoint | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const hasBudget = report.monthlyBudgetCents > 0;
  const maximum = chartMaximum(Math.max(...report.months.map(month => month.totalSpendingCents), showBudget && hasBudget ? report.monthlyBudgetCents : 0));
  const point = hover ?? selection;
  const index = point?.index ?? report.months.length - 1;
  const month = report.months[index]!;
  const readoutVisible = hover !== null || selection !== null;
  const inspectedCategory = point?.categoryId === undefined ? undefined : report.categories.find(category => category.id === point.categoryId);

  function pointerMonth(clientX: number, clientY: number): MonthPoint {
    const bounds = plot.current!.getBoundingClientRect();
    const index = Math.max(0, Math.min(report.months.length - 1, Math.floor((clientX - bounds.left) / bounds.width * report.months.length)));
    const y = Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
    const column = plot.current!.querySelectorAll("[data-month-column]")[index]?.getBoundingClientRect();
    const amountAtPointer = (1 - y) * maximum;
    let cumulative = 0;
    const category = column && clientX >= column.left && clientX <= column.right
      ? report.categories.find(category => {
        const amount = categoryAmount(report.months[index]!, category.id);
        cumulative += amount;
        return amount > 0 && amountAtPointer < cumulative;
      })
      : undefined;
    return { index, y, categoryId: category?.id, below: clientY < window.innerHeight / 2 };
  }

  function pointForMonth(index: number): MonthPoint {
    return { index, y: 1 - report.months[index]!.totalSpendingCents / maximum };
  }

  function dismiss() {
    plot.current?.focus({ preventScroll: true });
    setSelection(null);
    setHover(null);
  }

  return (
    <section aria-labelledby="insights-monthly-spending-title" onKeyDown={event => { if (event.key === "Escape") dismiss(); }}>
      <ChartHeading
        id="insights-monthly-spending-title"
        title="Monthly total spending"
        budget={showBudget}
        enabled={hasBudget}
        onBudgetChange={setShowBudget}
        help="Twelve months of recorded spending stacked by Category, including Uncategorized and Unbudgeted Spending. Select the space above a bar to see its monthly total, or a Category segment to see its amount. The dashed guide uses current recurring monthly Budgets, not reconstructed historical limits. Over Budget markers compare Budgeted Spending only; equality is At Budget Limit."
      >
        <details className="group">
          <summary className={chartDisclosureClass}>
            Category legends
            <ChevronDown aria-hidden="true" size={16} className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <ul aria-label="Monthly spending Categories" className="absolute inset-x-0 top-full z-20 flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md">
            {report.categories.map(category => (
              <li key={category.id ?? "uncategorized"} className="flex min-w-0 max-w-full items-center gap-2 text-sm">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: categoryColor(category) }} />
                <span className="break-words">{category.label}</span>
              </li>
            ))}
          </ul>
        </details>
      </ChartHeading>
      {!hasBudget && <p className="text-sm text-muted-foreground">No current monthly Budget reference is available.</p>}
      {report.totalSpendingCents === 0 && <p role="status" className="text-sm">No spending was recorded in this 12-month window.</p>}
      <p id="insights-monthly-chart-keys" className="sr-only">Use the arrow keys to select a month, Home or End to select the first or last month, and Escape to dismiss details.</p>
      <div className="relative mt-4 h-72 min-w-0">
        <div className="absolute inset-x-0 bottom-8 top-0 flex gap-2">
          <ChartScale maximum={maximum} />
          <div
            ref={plot}
            role="slider"
            tabIndex={0}
            aria-label="Monthly total spending chart"
            aria-describedby="insights-monthly-chart-keys"
            aria-valuemin={1}
            aria-valuemax={report.months.length}
            aria-valuenow={index + 1}
            aria-valuetext={`${fullMonth.format(periodDate(month.period))}: ${money(month.totalSpendingCents)}`}
            className="focus-ledger relative grid min-w-0 flex-1 cursor-pointer grid-cols-12 gap-1 border-b border-structure"
            onPointerMove={event => { if (event.pointerType === "mouse") setHover(pointerMonth(event.clientX, event.clientY)); }}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(selection ?? pointForMonth(report.months.length - 1))}
            onBlur={() => setHover(null)}
            onClick={event => { setSelection(pointerMonth(event.clientX, event.clientY)); setHover(null); }}
            onKeyDown={event => {
              const next = keyboardMonth(event, index, report.months.length);
              if (next !== null) { event.preventDefault(); setSelection(pointForMonth(next)); setHover(null); }
            }}
          >
            {showBudget && hasBudget && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-foreground" style={{ bottom: `${report.monthlyBudgetCents / maximum * 100}%` }} />
            )}
            {report.months.map(point => (
              <div data-month-column key={point.period} aria-hidden="true" className="pointer-events-none relative flex min-w-0 flex-col justify-end">
                {showBudget && hasBudget && point.budgetedSpendingCents > report.monthlyBudgetCents && (
                  <span className="absolute top-0 w-full text-center font-bold text-warning">!</span>
                )}
                <div className="flex flex-col overflow-hidden rounded-t-[var(--chart-radius)]" style={{ height: `${point.totalSpendingCents / maximum * 100}%` }}>
                  {report.categories.toReversed().map(category => {
                    const amount = categoryAmount(point, category.id);
                    return amount > 0 ? <span key={category.id ?? "uncategorized"} style={{ height: `${amount / point.totalSpendingCents * 100}%`, backgroundColor: categoryColor(category) }} className="block w-full shrink-0" /> : null;
                  })}
                </div>
                {point.totalSpendingCents === 0 && <span className="h-px w-full bg-muted-foreground" />}
              </div>
            ))}
          </div>
        </div>
        <MonthAxis months={report.months} />
        {readoutVisible && (
          <ChartPopup label={inspectedCategory ? `${inspectedCategory.label} · ${fullMonth.format(periodDate(month.period))}` : fullMonth.format(periodDate(month.period))} amountCents={inspectedCategory ? categoryAmount(month, inspectedCategory.id) : month.totalSpendingCents} x={(index + 0.5) / report.months.length} y={point!.y} below={point?.below} retained={selection !== null} onDismiss={dismiss} />
        )}
      </div>
    </section>
  );
}

interface CategoryPoint extends MonthPoint {
  readonly categoryId: string;
}

function CategoryTrendChart({ report }: { report: InsightsMonthlyReport }) {
  const [showBudget, setShowBudget] = useState(true);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string> | null>(null);
  const [selection, setSelection] = useState<CategoryPoint | null>(null);
  const [hover, setHover] = useState<CategoryPoint | null>(null);
  const plot = useRef<SVGSVGElement>(null);
  const categories = report.selectableCategories.filter((category): category is InsightsCategory & { readonly id: string } => category.id !== null);
  const defaults = new Set(categories.toSorted((a, b) => b.spendingCents - a.spendingCents || a.label.localeCompare(b.label)).slice(0, 3).map(category => category.id));
  const selected = selectedIds ?? defaults;
  const trends = categories.filter(category => selected.has(category.id));
  const hasBudget = trends.some(category => category.monthlyBudgetCents !== null);
  const maximum = chartMaximum(Math.max(0, ...trends.flatMap(category => [
    ...report.months.map(month => categoryAmount(month, category.id)),
    showBudget ? category.monthlyBudgetCents ?? 0 : 0,
  ])));
  const point = hover ?? selection;
  const category = trends.find(category => category.id === point?.categoryId);
  const month = point ? report.months[point.index] : undefined;
  const amount = category && month ? categoryAmount(month, category.id) : 0;
  const patterns = new Map<string, string | undefined>();
  const colorCounts = new Map<string, number>();
  categories.forEach(category => {
    const color = category.color ?? "none";
    const count = colorCounts.get(color) ?? 0;
    patterns.set(category.id, count === 0 ? undefined : ["6 3", "2 3", "8 3 2 3"][(count - 1) % 3]);
    colorCounts.set(color, count + 1);
  });
  const y = (amount: number) => 100 - amount / maximum * 100;

  function toggleCategory(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      if (selection?.categoryId === id) setSelection(null);
      if (hover?.categoryId === id) setHover(null);
    } else next.add(id);
    setSelectedIds(next);
  }

  function pointerPoint(categoryId: string, clientX: number, clientY: number): CategoryPoint {
    const bounds = plot.current!.getBoundingClientRect();
    return {
      categoryId,
      index: Math.max(0, Math.min(report.months.length - 1, Math.round((clientX - bounds.left) / bounds.width * (report.months.length - 1)))),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
      below: clientY < window.innerHeight / 2,
    };
  }

  function pointForCategory(categoryId: string, index: number): CategoryPoint {
    return { categoryId, index, y: 1 - categoryAmount(report.months[index]!, categoryId) / maximum };
  }

  function dismiss() {
    if (category) document.getElementById(`insights-category-line-${category.id}`)?.focus({ preventScroll: true });
    setSelection(null);
    setHover(null);
  }

  function selectWithKeyboard(event: KeyboardEvent, categoryId: string) {
    const current = point?.categoryId === categoryId ? point.index : report.months.length - 1;
    const next = keyboardMonth(event, current, report.months.length);
    if (next !== null) { event.preventDefault(); setSelection(pointForCategory(categoryId, next)); setHover(null); }
  }

  return (
    <section aria-labelledby="insights-category-spending-title" onKeyDown={event => { if (event.key === "Escape") dismiss(); }}>
      <ChartHeading
        id="insights-category-spending-title"
        title="Spending by Category"
        budget={showBudget}
        enabled={hasBudget}
        onBudgetChange={setShowBudget}
        help="Monthly Category trends across twelve months. Choose Categories to compare, then select a line to see its Category, month, and amount. Dashed Budget guides use each selected Category’s current recurring monthly Budget, including historical comparisons; past limits are not reconstructed. Spending lines retain Category Colors and use different patterns when colors are shared."
      >
        <details className="group">
          <summary className={chartDisclosureClass}>
            Categories to compare · {trends.length} selected
            <ChevronDown aria-hidden="true" size={16} className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div role="group" aria-label="Categories to compare" className="absolute inset-x-0 top-full z-20 flex flex-wrap gap-2 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md">
            {categories.map(category => (
              <button type="button" className={`${controlClass} max-w-full break-words`} key={category.id} style={selected.has(category.id) ? { backgroundColor: categoryColor(category), borderColor: "var(--foreground)" } : undefined} aria-pressed={selected.has(category.id)} onClick={() => toggleCategory(category.id)}><span className={selected.has(category.id) ? "rounded-sm bg-background px-1 text-foreground" : undefined}>{category.label}</span></button>
            ))}
          </div>
        </details>
      </ChartHeading>
      {!hasBudget && <p className="text-sm text-muted-foreground">No selected Category has a current monthly Budget reference.</p>}
      {trends.length === 0 ? (
        <p role="status" className="text-sm">{categories.length === 0 ? "No Categories are available to compare in this Space." : "Select a Category to see its spending trend."}</p>
      ) : (
        <>
          {!trends.some(category => category.spendingCents > 0) && <p role="status" className="text-sm">No spending was recorded for the selected Categories in this window.</p>}
          <p id="insights-category-chart-keys" className="sr-only">Focus a Category line or its legend button. Use the arrow keys to select a month, Home or End to select the first or last month, and Escape to dismiss details.</p>
          <div className="relative h-72 min-w-0">
            <div className="absolute inset-x-0 bottom-8 top-0 flex gap-2">
              <ChartScale maximum={maximum} />
              <svg ref={plot} role="group" aria-label="Monthly Category trends" viewBox="0 0 100 100" preserveAspectRatio="none" className="min-w-0 flex-1 overflow-visible border-b border-structure">
                {showBudget && trends.map(category => category.monthlyBudgetCents === null ? null : (
                  <line aria-hidden="true" key={`${category.id}-budget`} x1={0} x2={100} y1={y(category.monthlyBudgetCents)} y2={y(category.monthlyBudgetCents)} stroke={categoryColor(category)} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" className="pointer-events-none opacity-60" />
                ))}
                {trends.map(category => {
                  const points = report.months.map((month, index) => `${index / (report.months.length - 1) * 100},${y(categoryAmount(month, category.id))}`).join(" ");
                  return (
                    <g key={category.id}>
                      <polyline aria-hidden="true" fill="none" points={points} stroke={categoryColor(category)} strokeDasharray={patterns.get(category.id)} strokeWidth={2} vectorEffect="non-scaling-stroke" className="pointer-events-none" />
                      <polyline
                        id={`insights-category-line-${category.id}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${category.label} monthly spending`}
                        aria-describedby="insights-category-chart-keys"
                        aria-pressed={selection?.categoryId === category.id}
                        fill="none"
                        points={points}
                        stroke="transparent"
                        strokeWidth={12}
                        vectorEffect="non-scaling-stroke"
                        className="focus-ledger cursor-pointer"
                        onPointerMove={event => { if (event.pointerType === "mouse") setHover(pointerPoint(category.id, event.clientX, event.clientY)); }}
                        onPointerLeave={() => setHover(null)}
                        onFocus={() => setHover(pointForCategory(category.id, selection?.categoryId === category.id ? selection.index : report.months.length - 1))}
                        onBlur={() => setHover(null)}
                        onClick={event => { setSelection(pointerPoint(category.id, event.clientX, event.clientY)); setHover(null); }}
                        onKeyDown={event => selectWithKeyboard(event, category.id)}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
            <MonthAxis months={report.months} />
            {category && month && point && (
              <ChartPopup label={`${category.label} · ${fullMonth.format(periodDate(month.period))}`} amountCents={amount} x={point.index / (report.months.length - 1)} y={point.y} below={point.below} retained={selection !== null} onDismiss={dismiss} />
            )}
          </div>
          <ul aria-label="Selected Categories in trend chart" className="mt-4 flex flex-wrap gap-2">
            {trends.map(category => (
              <li key={category.id} className="min-w-0 max-w-full">
                <button
                  className={`${controlClass} flex max-w-full items-center gap-2 text-left`}
                  type="button"
                  aria-pressed={selection?.categoryId === category.id}
                  aria-describedby="insights-category-chart-keys"
                  onFocus={() => setHover(pointForCategory(category.id, report.months.length - 1))}
                  onBlur={() => setHover(null)}
                  onClick={() => { setSelection(pointForCategory(category.id, report.months.length - 1)); setHover(null); }}
                  onKeyDown={event => selectWithKeyboard(event, category.id)}
                >
                  <svg aria-hidden="true" width="28" height="12" className="shrink-0"><line x1={0} x2={28} y1={6} y2={6} stroke={categoryColor(category)} strokeWidth={2} strokeDasharray={patterns.get(category.id)} /></svg>
                  <span className="break-words">{category.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="sr-only">
        <table>
          <caption>Monthly Category spending values. Historical references use current monthly Budgets.</caption>
          <thead><tr><th scope="col">Reporting Period</th>{trends.map(category => <th scope="col" key={category.id}>{category.label} spending / current monthly Budget</th>)}</tr></thead>
          <tbody>{report.months.map(month => (
            <tr key={month.period}><th scope="row">{formatReportingPeriod(month.period)}</th>{trends.map(category => <td key={category.id}>{money(categoryAmount(month, category.id))} / {category.monthlyBudgetCents === null ? "No monthly Budget" : money(category.monthlyBudgetCents)}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function LedgerCharts({ report }: { report: InsightsMonthlyReport }) {
  return (
    <div className="grid min-w-0 gap-8">
      <MonthlyTotalChart report={report} />
      <CategoryTrendChart report={report} />
      <div className="sr-only">
        <table>
          <caption>Monthly total spending values. Historical references use current monthly Budgets.</caption>
          <thead><tr><th scope="col">Reporting Period</th><th scope="col">Total spending</th><th scope="col">Budgeted Spending</th><th scope="col">Current monthly Budget</th></tr></thead>
          <tbody>{report.months.map(month => <tr key={month.period}><th scope="row">{formatReportingPeriod(month.period)}</th><td>{money(month.totalSpendingCents)}</td><td>{money(month.budgetedSpendingCents)}</td><td>{money(report.monthlyBudgetCents)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function InsightsPage({ spaceId, onSpaceChange, onViewTransactions, onEditBudget, returnContext }: InsightsPageProps = {}) {
  const [helpDismissal, setHelpDismissal] = useState(0);
  const { period } = useReportingPeriod();
  const shouldResolvePersonalSpace = onSpaceChange !== undefined;
  const spacesQuery = useAccessibleSpacesQuery(shouldResolvePersonalSpace);
  const effectiveSpaceId = spaceId ?? spacesQuery.data?.find(space => space.kind === "personal")?.id;
  const insightsQuery = useInsightsQuery(period, effectiveSpaceId, !shouldResolvePersonalSpace || spacesQuery.isSuccess, "monthly");
  const restoredContext = useRef<InsightsReturnContext | undefined>(undefined);
  useEffect(() => {
    if (!returnContext || !insightsQuery.isSuccess || restoredContext.current === returnContext) return;
    const frame = requestAnimationFrame(() => {
      restoredContext.current = returnContext;
      const target = document.getElementById(returnContext.focusId) ?? document.getElementById("insights-monthly-spending-title");
      const disclosure = target?.closest("details");
      if (disclosure) disclosure.open = true;
      restoreActionFocus(target);
      restorePageScroll(returnContext.scroll);
    });
    return () => cancelAnimationFrame(frame);
  }, [returnContext, insightsQuery.isSuccess]);

  if (spacesQuery.isError) return <FeatureDataError message={spacesQuery.error.message} onRetry={() => void spacesQuery.refetch()} />;
  if (spacesQuery.isSuccess && !effectiveSpaceId) return <FeatureDataError message="Personal Space is unavailable." onRetry={() => void spacesQuery.refetch()} />;
  if (insightsQuery.isPending) return <FeatureDataLoading label="Loading Insights" />;
  if (insightsQuery.isError && !insightsQuery.data) return <FeatureDataError message={insightsQuery.error.message} onRetry={() => void insightsQuery.refetch()} />;
  if (!insightsQuery.data || insightsQuery.data.view !== "monthly") return null;

  return (
    <HelpDismissalContext.Provider value={helpDismissal}>
    <div data-insights-view="monthly" onKeyDownCapture={event => { if (event.key === "Escape") setHelpDismissal(current => current + 1); }} className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b border-structure pb-5">
        <div><ActiveSpaceLabel spaceId={effectiveSpaceId} spaces={spacesQuery.data} /><h1 className="mt-2 font-mono text-2xl font-bold tracking-tight md:text-3xl">Insights</h1></div>
        <div className="ml-auto w-48 max-w-full [&>div]:h-11 [&_input]:min-h-11 [&_button]:min-h-11 [&_button]:min-w-11">
          <ReportingPeriodFilter id="insights-reporting-period" />
        </div>
      </header>
      {insightsQuery.isError && <FeatureDataError message={insightsQuery.error.message} onRetry={() => void insightsQuery.refetch()} />}
      <div aria-busy={insightsQuery.isFetching}>
        <LedgerCharts key={`${effectiveSpaceId ?? "personal"}-${period}`} report={insightsQuery.data} />
        <details key={`inspection-${effectiveSpaceId ?? "personal"}-${period}`} className="mt-4">
          <summary className={chartDisclosureClass}>Inspect monthly spending</summary>
          <MonthlyInspection
            report={insightsQuery.data}
            initialPoint={returnContext?.period === period && returnContext.spaceId === effectiveSpaceId ? returnContext.inspectionPoint : undefined}
            onViewTransactions={onViewTransactions ? (categoryId, selectedPeriod, focusId) => onViewTransactions(categoryId, selectedPeriod, effectiveSpaceId, {
              scroll: capturePageScroll(), focusId: focusId ?? "insights-inspect-spending", period, spaceId: effectiveSpaceId, view: "monthly", inspectionPoint: selectedPeriod,
            }) : undefined}
            onEditBudget={onEditBudget ? (categoryId, selectedPeriod, focusId) => onEditBudget(categoryId, selectedPeriod, effectiveSpaceId, undefined, focusId) : undefined}
          />
        </details>
      </div>
    </div>
    </HelpDismissalContext.Provider>
  );
}

function MonthlyInspection({ report, initialPoint, onViewTransactions, onEditBudget }: {
  report: InsightsMonthlyReport;
  initialPoint?: string;
  onViewTransactions?: (categoryId: string | undefined, period: ReportingPeriod, focusId?: string) => void;
  onEditBudget?: (categoryId: string, period: ReportingPeriod, focusId?: string) => void;
}) {
  const [inspection, setInspection] = useState<{ point: string; triggerId: string; open: boolean } | null>(initialPoint ? { point: initialPoint, triggerId: "insights-inspect-spending", open: false } : null);
  return <SpendingInspection report={report} point={inspection?.point} triggerId={inspection?.triggerId} open={inspection?.open ?? false}
    onInspect={(point, triggerId) => setInspection({ point, triggerId, open: true })}
    onDismiss={() => setInspection(current => current ? { ...current, open: false } : null)}
    onViewTransactions={onViewTransactions} onEditBudget={onEditBudget} />;
}

export { InsightsPage };
export type { InsightsReturnContext };
