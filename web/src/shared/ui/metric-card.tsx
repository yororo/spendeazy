import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  emphasized?: boolean;
  progress?: number;
  className?: string;
}

function MetricCard({
  label,
  value,
  detail,
  emphasized = false,
  progress,
  className,
}: MetricCardProps) {
  return (
    <Card
      variant={emphasized ? "accent" : "strong"}
      className={cn("h-full", className)}
    >
      <CardContent className="flex min-h-28 flex-col justify-between gap-3 p-4">
        <p className="text-label">{label}</p>
        <div>
          <p className="text-metric text-2xl wrap-anywhere">{value}</p>
          {detail ? (
            <p
              className={cn(
                "mt-1 text-xs wrap-anywhere",
                emphasized ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {detail}
            </p>
          ) : null}
        </div>
        {typeof progress === "number" ? (
          <Progress
            value={progress}
            aria-label={`${label}: ${progress}%`}
            className={emphasized ? "bg-black/20" : undefined}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export { MetricCard };
