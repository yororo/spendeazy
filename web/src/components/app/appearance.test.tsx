// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { initializeAppearance, setAppearance } from "./appearance";
import { AppearanceSelector } from "./appearance-selector";

let dark = false;
let systemChanged: () => void;
let dispose: () => void;

beforeEach(() => {
  localStorage.clear();
  dark = false;
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return dark; },
    addEventListener: (_event: string, listener: () => void) => { systemChanged = listener; },
    removeEventListener: vi.fn(),
  }));
  dispose = initializeAppearance();
});

afterEach(() => {
  cleanup();
  dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

it("follows OS changes only in System mode and restores a saved override", () => {
  expect(document.documentElement.dataset.theme).toBe("light");
  dark = true;
  systemChanged();
  expect(document.documentElement.dataset.theme).toBe("dark");
  setAppearance("light");
  systemChanged();
  expect(document.documentElement.dataset.theme).toBe("light");
  dispose();
  dispose = initializeAppearance();
  expect(document.documentElement.dataset.theme).toBe("light");
  setAppearance("system");
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("synchronizes external storage changes and treats invalid or cleared values as System", () => {
  localStorage.setItem("spendeazy.appearance", "dark");
  window.dispatchEvent(new StorageEvent("storage", { key: "spendeazy.appearance" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  localStorage.setItem("spendeazy.appearance", "invalid");
  window.dispatchEvent(new StorageEvent("storage", { key: "spendeazy.appearance" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  setAppearance("dark");
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("still switches appearance when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  dispose();
  dispose = initializeAppearance();
  setAppearance("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("exposes the selected option, supports keyboard selection, and restores trigger focus", async () => {
  render(<AppearanceSelector />);
  const trigger = screen.getByRole("button", { name: "Appearance: System" });
  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  const darkOption = screen.getByRole("menuitemradio", { name: "Dark" });
  await waitFor(() => expect(document.activeElement).toBe(darkOption));
  expect(screen.getByRole("menuitemradio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(darkOption, { key: "Enter" });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.queryByRole("menu")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  fireEvent.click(trigger);
  expect(screen.getByRole("menuitemradio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  act(() => setAppearance("system"));
});
