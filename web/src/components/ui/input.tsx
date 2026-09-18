import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "focus-ledger h-10 w-full min-w-0 border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:bg-muted disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
