import { useSyncExternalStore } from "react";

type Appearance = "light" | "system" | "dark";
const STORAGE_KEY = "spendeazy.appearance";
const CHANGE_EVENT = "spendeazy:appearance";
let preference: Appearance = "system";

function readPreference(): Appearance {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

// Start before React renders so every route and native control shares the theme.
function initializeAppearance() {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  preference = readPreference();
  function apply() {
    document.documentElement.dataset.theme =
      preference === "system" ? (system.matches ? "dark" : "light") : preference;
  }
  function syncStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    preference = readPreference();
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  apply();
  system.addEventListener("change", apply);
  window.addEventListener(CHANGE_EVENT, apply);
  window.addEventListener("storage", syncStorage);
  return () => {
    system.removeEventListener("change", apply);
    window.removeEventListener(CHANGE_EVENT, apply);
    window.removeEventListener("storage", syncStorage);
  };
}

function setAppearance(value: Appearance) {
  preference = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // A blocked browser store still permits an appearance choice for this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function useAppearance() {
  return useSyncExternalStore(subscribe, () => preference);
}

export { initializeAppearance, setAppearance, useAppearance };
