import { useState } from "react";
import { Info } from "lucide-react";

function CategoryAttentionHelp() {
  const [active, setActive] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (active || pinned);
  return (
    <div onPointerEnter={() => { setActive(true); setDismissed(false); }} onPointerLeave={() => setActive(false)}>
      <button type="button" aria-label="About Category attention" aria-expanded={open}
        aria-describedby={open ? "category-attention-help" : undefined}
        className="focus-ledger flex size-11 items-center justify-center rounded-md"
        onFocus={() => { setActive(true); setDismissed(false); }} onBlur={() => { setActive(false); setPinned(false); }}
        onClick={() => { setPinned(!pinned); setDismissed(pinned); }} onKeyDown={event => { if (event.key === "Escape") { setPinned(false); setDismissed(true); } }}>
        <Info size={16} aria-hidden="true" />
      </button>
      {open && <div id="category-attention-help" role="tooltip" className="absolute left-0 top-full z-30 w-72 max-w-full rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md">
        Categories at 80% of their monthly Budget, plus the three highest unbudgeted Categories
      </div>}
    </div>
  );
}

export { CategoryAttentionHelp };
