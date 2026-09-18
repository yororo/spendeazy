import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

import type { SpendingPoint } from "./dashboard-service";

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
  const maxValue = Math.max(1, ...points.map((point) => point.amount));

  return (
    <Card variant="strong" className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle id="spending-chart-title">{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-3 font-mono text-xs">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-2 bg-primary" />
            {currentLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <figure
          aria-labelledby="spending-chart-title"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-x-auto pb-2">
            <div
              aria-hidden="true"
              className="flex h-48 items-end gap-0.5 border-foreground pt-3 md:h-full md:min-h-56 md:min-w-2xl md:gap-2 md:px-3"
            >
              {points.map((point, index) => (
                <div
                  key={point.label}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 md:min-w-4"
                >
                  <div className="flex min-h-0 flex-1 items-end">
                    <div
                      className="min-h-px w-full bg-primary"
                      style={{ height: `${(point.amount / maxValue) * 100}%` }}
                    />
                  </div>
                  <span className={cn(
                    "flex shrink-0 justify-center font-mono text-xs text-muted-foreground",
                    index % 7 !== 0 && "invisible md:visible",
                  )}>
                    {point.label}
                  </span>
                </div>
              ))}
            </div>
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
