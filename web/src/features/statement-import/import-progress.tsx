import { cn } from "@/lib/utils";

const steps = ["Upload", "Categorize", "Review"] as const;

interface ImportProgressProps {
  currentStep: (typeof steps)[number];
  className?: string;
}

function ImportProgress({ currentStep, className }: ImportProgressProps) {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <ol
      aria-label="Statement import progress"
      className={cn("flex w-full sm:w-auto", className)}
    >
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isComplete = index < currentIndex;

        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 border px-3 font-mono text-xs sm:flex-none",
              index > 0 && "-ml-px",
              isCurrent
                ? "relative z-10 border-foreground bg-primary font-bold text-primary-foreground"
                : "border-border bg-background text-muted-foreground",
              isComplete && "border-foreground text-foreground",
            )}
          >
            <span className="font-bold tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="truncate font-semibold uppercase">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

export { ImportProgress };
