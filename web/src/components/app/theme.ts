import { useSyncExternalStore } from "react";

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
  function apply() {
    document.documentElement.dataset.visualTheme = preference;
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
