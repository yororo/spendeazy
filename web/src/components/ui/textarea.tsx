import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "focus-ledger min-h-24 w-full min-w-0 resize-y border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:bg-muted disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
