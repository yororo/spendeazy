import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type DateInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

function DateInput({ className, ...props }: DateInputProps) {
  return (
    <div data-slot="date-input" className="relative min-w-0">
      <Input
        {...props}
        type="date"
        className={cn("date-input-control max-w-full pr-10", className)}
      />
      <CalendarIcon
        data-slot="date-input-icon"
        className="date-input-mobile-icon pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export { DateInput };
