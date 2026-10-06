import { useSyncExternalStore } from "react";
import { capturePageScroll, restorePageScroll } from "@/shared/ui/page-scroll";

type Theme = "technical" | "playful";
const STORAGE_KEY = "spendeazy.theme";
const CHANGE_EVENT = "spendeazy:theme";
let preference: Theme = "technical";

function readPreference(): Theme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "playful" ? "playful" : "technical";
  } catch {
    return "technical";
  }
}

// Independent of the existing resolved Appearance marker and session lifecycle.
function initializeTheme() {
  preference = readPreference();
  let cancelRestoration = () => {};
  function apply() {
    cancelRestoration();
    const scroll = capturePageScroll();
    const hosts = [document.documentElement, document.querySelector<HTMLElement>("[data-page-scroll-host]")].filter((host): host is HTMLElement => host !== null);
    const anchors = hosts.map(host => host.style.overflowAnchor);
    hosts.forEach(host => { host.style.overflowAnchor = "none"; });
    let cancelled = false;
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const cleanup = () => {
      hosts.forEach((host, index) => { host.style.overflowAnchor = anchors[index]!; });
      events.forEach(event => window.removeEventListener(event, cancel));
    };
    const cancel = () => { cancelled = true; cleanup(); };
    cancelRestoration = cancel;
    events.forEach(event => window.addEventListener(event, cancel, { once: true, passive: true }));
    document.documentElement.dataset.visualTheme = preference;
    // The first layout can use fallback fonts. Keep anchoring disabled until the
    // selected font finishes loading, unless the User starts another interaction.
    void document.documentElement.offsetHeight;
    restorePageScroll(scroll);
    const restored = capturePageScroll();
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        const current = capturePageScroll();
        if (current.windowTop === restored.windowTop && current.contentTop === restored.contentTop) restorePageScroll(scroll);
        requestAnimationFrame(() => { if (!cancelled) cleanup(); });
      });
    });
  }
  function syncStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    preference = readPreference();
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  apply();
  window.addEventListener(CHANGE_EVENT, apply);
  window.addEventListener("storage", syncStorage);
  return () => {
    cancelRestoration();
    window.removeEventListener(CHANGE_EVENT, apply);
    window.removeEventListener("storage", syncStorage);
  };
}

function setTheme(value: Theme) {
  preference = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Blocked storage still allows selection for the current visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function useTheme() {
  return useSyncExternalStore(subscribe, () => preference);
}

export { initializeTheme, setTheme, useTheme };
