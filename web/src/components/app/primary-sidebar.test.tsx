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
