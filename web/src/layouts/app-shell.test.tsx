// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("@clerk/react", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ user: { fullName: "Ada Lovelace" } }),
}));

beforeEach(() => {
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppShell", () => {
  it("keeps the compact navigation fixed and anchors the profile in its panel", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const header = screen.getByRole("banner");
    expect(header.parentElement?.className).toContain("min-h-screen");
    expect(header.classList.contains("fixed")).toBe(true);
    expect(screen.getByRole("main").parentElement?.classList).toContain(
      "mobile-navigation-content",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const navigation = screen.getByRole("dialog", {
      name: "Primary navigation",
    });
    expect(within(navigation).getByText("Ada Lovelace")).toBeTruthy();
    fireEvent.click(within(navigation).getByRole("button", { name: "Appearance: System" }));
    expect(within(navigation).getByRole("menu", { name: "Appearance" })).toBeTruthy();
    expect(within(navigation).getAllByRole("menuitemradio")).toHaveLength(3);
    fireEvent.keyDown(within(navigation).getByRole("menu"), { key: "Escape" });
    expect(within(navigation).queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Primary navigation" })).toBe(navigation);
    expect(
      Array.from(navigation.children).some((child) =>
        child.classList.contains("h-dvh"),
      ),
    ).toBe(true);
    expect(
      within(navigation).getByText("Sign out").closest("div.border")
        ?.classList.contains("shrink-0"),
    ).toBe(true);
  });
});
