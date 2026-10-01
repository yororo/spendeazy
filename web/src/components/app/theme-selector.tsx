import { useId } from "react";

import { setTheme, useTheme } from "./theme";

function ThemeSelector() {
  const theme = useTheme();
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-label">Theme</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["technical", "playful"] as const).map((value) => (
          <label key={value} className="theme-choice flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 border border-sidebar-border px-2 py-2 text-xs has-checked:bg-primary has-checked:text-primary-foreground">
            <input
              type="radio"
              name={name}
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
              className="focus-ledger size-4 shrink-0 accent-current"
            />
            {value === "technical" ? "Technical" : "Playful"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export { ThemeSelector };
