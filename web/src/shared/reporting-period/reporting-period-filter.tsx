import { useRef } from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  formatReportingPeriod,
  parseReportingPeriod,
  type ReportingPeriod,
} from "./reporting-period";
import { useReportingPeriod } from "./use-reporting-period";

interface ReportingPeriodFilterProps {
  id: string;
  disabled?: boolean;
  onPeriodChange?: (period: ReportingPeriod) => void;
}

function ReportingPeriodFilter({
  id,
  disabled = false,
  onPeriodChange,
}: ReportingPeriodFilterProps) {
  const { period, setPeriod } = useReportingPeriod();
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpeningFallbackRef = useRef(false);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input || disabled) return;

    const showPicker = Reflect.get(input, "showPicker");
    if (typeof showPicker === "function") {
      try {
        showPicker.call(input);
        return;
      } catch {
        // Some native browser controls expose showPicker but reject the call.
      }
    }

    isOpeningFallbackRef.current = true;
    input.focus();
    input.click();
    isOpeningFallbackRef.current = false;
  };

  return (
    <div
      className="relative flex h-10 w-full min-w-0 border border-foreground bg-background px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 has-[:disabled]:bg-muted has-[:disabled]:opacity-60 sm:w-48 sm:shrink-0"
      onClick={() => {
        if (!isOpeningFallbackRef.current) openPicker();
      }}
    >
      <Label htmlFor={id} className="sr-only">
        Reporting period
      </Label>
      <Input
        id={id}
        ref={inputRef}
        type="month"
        value={period}
        className="h-full border-0 bg-transparent px-0 pr-10 font-mono tabular-nums text-transparent caret-transparent focus-visible:shadow-none disabled:bg-transparent disabled:opacity-100 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-datetime-edit]:text-transparent"
        disabled={disabled}
        onChange={(event) => {
          const nextPeriod = parseReportingPeriod(event.target.value);
          if (!nextPeriod || nextPeriod === period) return;

          setPeriod(nextPeriod);
          onPeriodChange?.(nextPeriod);
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 right-10 flex items-center overflow-hidden whitespace-nowrap bg-inherit font-mono text-sm tabular-nums text-foreground"
      >
        {formatReportingPeriod(period)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0"
        aria-label="Choose reporting period"
        disabled={disabled}
      >
        <CalendarIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

export { ReportingPeriodFilter };
