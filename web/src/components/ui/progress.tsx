import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value = 0,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const boundedValue = Math.min(100, Math.max(0, value ?? 0));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden bg-border", className)}
      value={boundedValue}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full bg-primary transition-transform"
        style={{ transform: `translateX(-${100 - boundedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
