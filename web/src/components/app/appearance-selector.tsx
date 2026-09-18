import { CheckIcon, MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";

import { setAppearance, useAppearance } from "@/components/app/appearance";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const options = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: SunMoonIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

function AppearanceSelector() {
  const appearance = useAppearance();
  const selected = options.find((option) => option.value === appearance)!;
  const Icon = selected.icon;

  return (
    <div className="relative shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Appearance: ${selected.label}`}
          title={`Appearance: ${selected.label}`}
          className="focus-ledger grid size-8 place-items-center border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-foreground/10"
        >
          <Icon className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Appearance" className="bottom-full mb-2 mt-0">
          {options.map(({ value, label, icon: OptionIcon }) => (
            <DropdownMenuItem
              key={value}
              role="menuitemradio"
              aria-checked={appearance === value}
              onSelect={() => setAppearance(value)}
            >
              <OptionIcon className="size-4" aria-hidden="true" />
              {label}
              {appearance === value && <CheckIcon className="ml-auto size-4" aria-hidden="true" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { AppearanceSelector };
