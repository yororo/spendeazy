// Throwaway comparison: current Dashboard versus the selected muted Playful theme.
// The requested theme preserves structure; ?variant=technical provides the baseline.
import { useEffect } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";

function DashboardThemePrototype() {
  const [params, setParams] = useSearchParams();
  const muted = params.get("variant") === "muted";

  useEffect(() => {
    function cycle(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], [role="combobox"], [role="slider"]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("variant", muted ? "technical" : "muted");
        return next;
      }, { replace: true });
    }
    window.addEventListener("keydown", cycle);
    return () => window.removeEventListener("keydown", cycle);
  }, [muted, setParams]);

  function toggle() {
    const next = new URLSearchParams(params);
    next.set("variant", muted ? "technical" : "muted");
    setParams(next, { replace: true });
  }

  return (
    <div role="region" className="dashboard-prototype-switcher" aria-label="Dashboard theme prototype">
      <button type="button" onClick={toggle} aria-label="Previous theme"><ArrowLeftIcon size={18} /></button>
      <span role="status"><small>PROTOTYPE · SAME DATA / LAYOUT</small>{muted ? "Muted Blue" : "Current Technical"}</span>
      <button type="button" onClick={toggle} aria-label="Next theme"><ArrowRightIcon size={18} /></button>
    </div>
  );
}

export { DashboardThemePrototype };
