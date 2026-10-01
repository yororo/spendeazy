// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import {
  AppSessionContext,
  type AppSession,
} from "@/shared/session/app-session";

import { PrimarySidebar } from "./primary-sidebar";

vi.mock("@/components/app/appearance-selector", () => ({
  AppearanceSelector: () => <button type="button">Appearance</button>,
}));

vi.mock("@/components/app/space-switcher", () => ({
  SpaceSwitcher: () => <div>Space switcher</div>,
}));

afterEach(cleanup);

const session: AppSession = {
  isLoaded: true,
  isSignedIn: true,
  sessionId: "session-1",
  user: {
    id: "user-1",
    fullName: "Sam Example",
    firstName: "Sam",
    primaryEmail: "sam@example.test",
  },
  getToken: async () => "token",
  openUserProfile: () => undefined,
  signOut: async () => undefined,
};

function CurrentLocation() {
  const location = useLocation();

  return <output>{`${location.pathname}${location.search}`}</output>;
}

describe("PrimarySidebar", () => {
  it("starts Settings collapsed and keeps it open after a Theme selection", () => {
    render(
      <AppSessionContext.Provider value={session}>
        <MemoryRouter><PrimarySidebar /></MemoryRouter>
      </AppSessionContext.Provider>,
    );
    const settings = screen.getByRole("button", { name: "Settings" });
    expect(settings.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /^Theme:/ })).toBeNull();
    fireEvent.click(settings);
    expect(settings.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Theme:/ }));
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Playful" }));
    expect(screen.getByRole("button", { name: "Theme: Playful" })).toBeTruthy();
    expect(settings.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    fireEvent.click(settings);
    expect(screen.queryByRole("button", { name: /^Theme:/ })).toBeNull();
  });

  it("opens Insights while preserving the selected Space", () => {
    render(
      <AppSessionContext.Provider value={session}>
        <MemoryRouter initialEntries={["/transactions?spaceId=shared-7"]}>
          <PrimarySidebar />
          <CurrentLocation />
        </MemoryRouter>
      </AppSessionContext.Provider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Insights" }));

    expect(screen.getByText("/insights?spaceId=shared-7")).toBeTruthy();
  });
});
