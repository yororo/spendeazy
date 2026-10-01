import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { setTheme, useTheme } from "./theme";

function ThemeSelector() {
  const theme = useTheme();
  const selected = theme === "playful" ? "Playful" : "Technical";
  return (
    <div className="relative min-w-0">
      <p className="mb-2 text-label">Theme</p>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Theme: ${selected}`}
          className="focus-ledger flex min-h-11 w-full items-center justify-between gap-2 border border-sidebar-border px-3 text-sm text-sidebar-foreground hover:bg-sidebar-foreground/10"
        >
          {selected}
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Theme" className="bottom-full mb-2 mt-0 w-full min-w-0">
          {(["technical", "playful"] as const).map((value) => (
            <DropdownMenuItem key={value} role="menuitemradio" aria-checked={theme === value}
              onSelect={() => setTheme(value)}>
              {value === "technical" ? "Technical" : "Playful"}
              {theme === value && <CheckIcon className="ml-auto size-4" aria-hidden="true" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { ThemeSelector };
