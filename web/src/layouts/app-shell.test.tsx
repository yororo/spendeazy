// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useCallback, useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";
import {
  useNavigationGuard,
  type NavigationAction,
} from "@/shared/navigation";
import { AppSessionProvider, type AppSession } from "@/shared/session";

const session: AppSession = {
  isLoaded: true,
  isSignedIn: true,
  sessionId: "session-1",
  user: {
    id: "user-1",
    fullName: "Ada Lovelace",
    firstName: "Ada",
    primaryEmail: "ada@example.test",
  },
  getToken: vi.fn(async () => "session-token"),
  signOut: vi.fn(async () => undefined),
};

beforeEach(() => {
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppShell", () => {
  it("guards primary navigation while a Statement Import is being categorized", () => {
    function CategorizeFixture() {
      const { registerNavigationGuard } = useNavigationGuard();
      const [pendingAction, setPendingAction] =
        useState<NavigationAction | null>(null);
      const onNavigationAttempt = useCallback((action: NavigationAction) => {
        setPendingAction((current) => current ?? action);
      }, []);

      useEffect(() => {
        return registerNavigationGuard({
          enabled: true,
          onNavigationAttempt,
        });
      }, [onNavigationAttempt, registerNavigationGuard]);

      const leave = () => {
        const action = pendingAction;
        setPendingAction(null);
        action?.();
      };

      return (
        <>
          {pendingAction && (
            <div role="dialog" aria-label="Leave Statement Import?">
              <button type="button" onClick={() => setPendingAction(null)}>
                Stay in Categorize
              </button>
              <button type="button" onClick={leave}>
                Leave Categorize
              </button>
            </div>
          )}
          <p>Statement Categorize</p>
        </>
      );
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/imports"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/imports" element={<CategorizeFixture />} />
              <Route path="/categories" element={<p>Categories page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("link", { name: "Categories" })[0]!,
    );
    expect(
      screen.getByRole("dialog", { name: "Leave Statement Import?" }),
    ).toBeTruthy();
    expect(screen.getByText("Statement Categorize")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stay in Categorize" }));
    expect(screen.queryByText("Categories page")).toBeNull();

    fireEvent.click(
      screen.getAllByRole("link", { name: "Categories" })[0]!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave Categorize" }));
    expect(screen.getByText("Categories page")).toBeTruthy();
  });

  it("keeps the compact navigation fixed and anchors the profile in its panel", () => {
    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>Dashboard content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
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
