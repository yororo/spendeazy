import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

import type { SpendingPoint } from "./dashboard-service";

const MAX_AXIS_INTERVALS = 4;

const axisMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const compactAxisMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
  currencyDisplay: "narrowSymbol",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function createAmountAxis(highestAmount: number) {
  if (highestAmount <= 0) {
    return { maximum: 1, values: [1, 0] };
  }

  const targetInterval = highestAmount / MAX_AXIS_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(targetInterval));
  const normalizedInterval = targetInterval / magnitude;
  const niceInterval =
    normalizedInterval <= 1
      ? magnitude
      : normalizedInterval <= 2
        ? magnitude * 2
        : normalizedInterval <= 5
          ? magnitude * 5
          : magnitude * 10;
  const interval = Math.max(0.01, niceInterval);
  const intervalCount = Math.ceil(highestAmount / interval);
  const maximum = intervalCount * interval;

  return {
    maximum,
    values: Array.from(
      { length: intervalCount + 1 },
      (_, index) => maximum - index * interval,
    ),
  };
}

function formatAxisMoney(amount: number) {
  return amount >= 1000
    ? compactAxisMoneyFormatter.format(amount)
    : axisMoneyFormatter.format(amount);
}

interface SpendingChartProps {
  points: readonly SpendingPoint[];
  title: string;
  currentLabel: string;
  summary: string;
}

function SpendingChart({
  points,
  title,
  currentLabel,
  summary,
}: SpendingChartProps) {
  const [hover, setHover] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const suppressHover = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const active = points.find(point => point.label === (hover ?? selection));
  function dismiss() {
    if (selection) buttons.current.get(selection)?.focus({ preventScroll: true });
    suppressHover.current = true;
    setSelection(null); setHover(null);
  }
  const highestAmount = Math.max(0, ...points.map((point) => point.amount));
  const amountAxis = createAmountAxis(highestAmount);

  return (
    <Card variant="strong" className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle id="spending-chart-title">{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-3 font-mono text-xs">
          <span className="inline-flex items-center gap-2">

            {currentLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <figure
          aria-labelledby="spending-chart-title"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="relative min-h-0 flex-1 pb-2" onKeyDown={event => { if (event.key === "Escape") dismiss(); }}>
            <div
              className="flex h-48 min-w-0 md:h-full md:min-h-56"
            >
              <div className="relative mb-5 w-14 shrink-0 font-mono text-[10px] leading-3 text-muted-foreground md:sticky md:left-0 md:z-20 md:bg-card" aria-hidden="true">
                {amountAxis.values.map((value, index) => (
                  <span
                    key={value}
                    className={cn(
                      "absolute right-2 whitespace-nowrap",
                      index === 0
                        ? "translate-y-0"
                        : index === amountAxis.values.length - 1
                          ? "-translate-y-full"
                          : "-translate-y-1/2",
                    )}
                    style={{
                      top: `${((amountAxis.maximum - value) / amountAxis.maximum) * 100}%`,
                    }}
                  >
                    {formatAxisMoney(value)}
                  </span>
                ))}
              </div>
              <div className="flex min-w-0 flex-1 flex-col ">
                <div className="relative min-h-0 flex-1 border-b border-structure">
                  {amountAxis.values.map((value) => (
                    <div
                      key={value}
                      className="pointer-events-none absolute inset-x-0 border-t border-border"
                      style={{
                        top: `${((amountAxis.maximum - value) / amountAxis.maximum) * 100}%`,
                      }}
                    />
                  ))}
                  <div className="relative z-10 flex h-full items-end gap-0.5 md:gap-2 md:px-3">
                    {points.map((point) => (
                      <button
                        type="button"
                        ref={element => { if (element) buttons.current.set(point.label, element); else buttons.current.delete(point.label); }}
                        aria-label={`Day ${point.label}: ${formatMoney(point.amount)}`}
                        aria-pressed={selection === point.label}
                        onPointerEnter={event => { if (event.pointerType === "mouse" && !suppressHover.current) setHover(point.label); }}
                        onPointerMove={event => { if (event.pointerType === "mouse") { suppressHover.current = false; setHover(point.label); } }}
                        onPointerLeave={() => setHover(null)}
                        onFocus={() => setHover(point.label)} onBlur={() => setHover(null)}
                        onClick={() => { setSelection(point.label); setHover(null); }}
                        onKeyDown={event => {
                          const index = points.indexOf(point);
                          const next = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : event.key === "ArrowRight" ? Math.min(index + 1, points.length - 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1) : null;
                          if (next !== null) { event.preventDefault(); buttons.current.get(points[next]!.label)?.focus(); }
                        }}
                        key={point.label}
                        className="focus-ledger flex h-full min-w-0 flex-1 items-end "
                      >
                        <div
                          aria-hidden="true" className="flex min-h-px w-full flex-col overflow-hidden rounded-t-[var(--chart-radius)]"
                          style={{
                            height: `${(point.amount / amountAxis.maximum) * 100}%`,
                          }}
                        >
                          {point.categories.map(category => <span key={category.id ?? "uncategorized"} className="block w-full shrink-0" style={{ height: `${category.amount / point.amount * 100}%`, backgroundColor: category.color === null ? "var(--muted-foreground)" : `var(--category-${category.color})` }} />)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div aria-hidden="true" className="flex h-5 shrink-0 gap-0.5 md:gap-2 md:px-3">
                  {points.map((point, index) => (
                    <span
                      key={point.label}
                      className={cn(
                        "flex min-w-0 flex-1 justify-center font-mono text-xs text-muted-foreground ",
                        index % 7 !== 0 && "invisible md:visible",
                      )}
                    >
                      {point.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {active && <div role="status" className={`absolute top-2 z-30 w-48 max-w-full rounded-md border bg-popover p-3 text-popover-foreground shadow-md ${selection ? "" : "pointer-events-none"}`} style={{ left: `clamp(0px, calc(3.5rem + (100% - 3.5rem) * ${(points.indexOf(active) + 0.5) / points.length} - 6rem), calc(100% - 12rem))` }}>
              <div className="flex items-start"><p className="flex-1 text-xs">Day {active.label} · {currentLabel}</p>{selection && <button type="button" aria-label="Dismiss chart details" className="focus-ledger -mr-2 -mt-2 flex size-11 items-center justify-center rounded-md" onClick={dismiss}><X size={16} aria-hidden="true" /></button>}</div>
              <p className="font-mono text-sm font-semibold tabular-nums">{formatMoney(active.amount)}</p>
            </div>}
          </div>

          <div className="sr-only">
            <table>
              <caption>{summary}</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">{currentLabel}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.label}>
                    <th scope="row">{point.label}</th>
                    <td>{formatMoney(point.amount)}</td>
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

export { SpendingChart };
