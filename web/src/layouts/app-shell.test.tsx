// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useCallback, useEffect, useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";
import { getSpaceStorageKey } from "@/components/app/space-selection";
import {
  useNavigationGuard,
  useUnsavedChangesNavigationGuard,
  type NavigationAction,
} from "@/shared/navigation";
import { AppSessionProvider, type AppSession } from "@/shared/session";

vi.mock("@/shared/api", () => ({
  getArchivedSpaces: (spaces: readonly { kind: string; status: string }[]) =>
    spaces.filter(
      (space) => space.kind === "shared" && space.status === "archived",
    ),
  useAccessibleSpacesQuery: () => ({
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
    data: [
      {
        id: "personal-1",
        kind: "personal",
        status: "active",
        accessLevel: "write",
        members: [{ id: "user-1", name: "Ada Lovelace" }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "shared-1",
        kind: "shared",
        status: "active",
        accessLevel: "write",
        members: [
          { id: "user-1", name: "Ada Lovelace" },
          { id: "user-2", name: "Grace Hopper" },
        ],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "archived-1",
        kind: "shared",
        status: "archived",
        accessLevel: "read",
        members: [
          { id: "user-1", name: "Ada Lovelace" },
          { id: "user-3", name: "Katherine Johnson" },
        ],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  }),
}));

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
  openUserProfile: vi.fn(),
  signOut: vi.fn(async () => undefined),
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppShell", () => {
  it("adds a separate History destination to desktop and mobile navigation when archives exist", () => {
    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<p>Transactions page</p>} />
              <Route path="/history" element={<p>History page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    expect(screen.getAllByRole("link", { name: "History" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByText("History page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      within(screen.getByRole("dialog", { name: "Primary navigation" })).getByRole(
        "link",
        { name: "History" },
      ),
    ).toBeTruthy();
  });

  it("keeps archived history outside active Space restoration and switching", async () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    const view = render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/history?spaceId=archived-1"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/history" element={<CurrentLocation />} />
              <Route path="/" element={<CurrentLocation />} />
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    expect(await screen.findByText("/history?spaceId=archived-1")).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Personal.*Ada Lovelace/u,
      }),
    );
    expect(screen.getByText("/")).toBeTruthy();

    view.unmount();
    localStorage.clear();
    sessionStorage.clear();
    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions?spaceId=archived-1"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    expect(await screen.findByText("/transactions")).toBeTruthy();
    expect(screen.queryByText("/transactions?spaceId=archived-1")).toBeNull();
  });

  it("does not carry the active Space query into the History destination", () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions?spaceId=shared-1"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
              <Route path="/history" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByText("/history")).toBeTruthy();
  });

  it("switches the current page to Shared from the profile panel", () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions?month=2026-09"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );
    expect(screen.getByText("/transactions?month=2026-09&spaceId=shared-1")).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: /Personal.*Ada Lovelace/u }),
    );
    expect(screen.getByText("/transactions?month=2026-09")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Primary navigation" })).getByRole(
        "button",
        { name: /Active Space/u },
      ),
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );
    expect(screen.getByText("/transactions?month=2026-09&spaceId=shared-1")).toBeTruthy();
  });

  it("shows the identity-rich Space switcher directly in the mobile header", () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    const header = screen.getByRole("banner");
    expect(within(header).getByText(/Personal.*Ada Lovelace/u)).toBeTruthy();
    fireEvent.click(
      within(header).getByRole("button", { name: /Active Space/u }),
    );
    expect(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );
    expect(screen.getByText("/?spaceId=shared-1")).toBeTruthy();
  });

  it("supports keyboard Space switching from the desktop control", async () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions?month=2026-09"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    const trigger = screen.getAllByRole("button", {
      name: /Active Space/u,
    })[0]!;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const personalOption = await waitFor(() =>
      screen.getByRole("menuitemradio", {
        name: /Personal.*Ada Lovelace/u,
      }),
    );
    expect(document.activeElement).toBe(personalOption);

    const sharedOption = await waitFor(() =>
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );
    fireEvent.keyDown(personalOption, { key: "ArrowDown" });
    expect(document.activeElement).toBe(sharedOption);

    fireEvent.keyDown(sharedOption, { key: "Enter" });
    expect(
      screen.getByText("/transactions?month=2026-09&spaceId=shared-1"),
    ).toBeTruthy();
  });

  it("preserves the selected Space through app navigation", () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter
          initialEntries={["/transactions?month=2026-09&spaceId=shared-1"]}
        >
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<CurrentLocation />} />
              <Route path="/transactions" element={<CurrentLocation />} />
              <Route path="/categories" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    fireEvent.click(screen.getAllByRole("link", { name: "Categories" })[0]!);
    expect(screen.getByText("/categories?spaceId=shared-1")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("link", { name: "Dashboard" })[0]!);
    expect(screen.getByText("/?spaceId=shared-1")).toBeTruthy();
  });

  it("does not strip the selected Space when the current primary destination is clicked", () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions?spaceId=shared-1"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    fireEvent.click(screen.getAllByRole("link", { name: "Transactions" })[0]!);

    expect(screen.getByText("/transactions?spaceId=shared-1")).toBeTruthy();
  });

  it("restores the device's last active Space in a new tab", async () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    const firstTab = render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );
    expect(screen.getByText("/transactions?spaceId=shared-1")).toBeTruthy();

    firstTab.unmount();
    sessionStorage.removeItem(getSpaceStorageKey("tab", session.user!.id));

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    expect(
      await screen.findByText("/transactions?spaceId=shared-1"),
    ).toBeTruthy();
  });

  it("falls back to Personal before rendering an unavailable URL Space", async () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions?spaceId=missing"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    expect(screen.queryByText("/transactions?spaceId=missing")).toBeNull();
    expect(await screen.findByText("/transactions")).toBeTruthy();
    expect(screen.queryByText("/transactions?spaceId=missing")).toBeNull();
  });

  it("retains the tab's selected Space when the app remounts", async () => {
    function CurrentLocation() {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    }

    const firstTab = render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );
    expect(screen.getByText("/transactions?spaceId=shared-1")).toBeTruthy();

    firstTab.unmount();
    localStorage.clear();

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/transactions" element={<CurrentLocation />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    expect(
      await screen.findByText("/transactions?spaceId=shared-1"),
    ).toBeTruthy();
  });

  it("keeps two already-open tabs on independent Space selections", () => {
    function CurrentLocation({ label }: { readonly label: string }) {
      const location = useLocation();
      return (
        <p>{`${label}:${location.pathname}${location.search}`}</p>
      );
    }

    render(
      <>
        <div data-testid="tab-one">
          <AppSessionProvider session={session}>
            <MemoryRouter initialEntries={["/transactions"]}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route
                    path="/transactions"
                    element={<CurrentLocation label="one" />}
                  />
                </Route>
              </Routes>
            </MemoryRouter>
          </AppSessionProvider>
        </div>
        <div data-testid="tab-two">
          <AppSessionProvider session={session}>
            <MemoryRouter initialEntries={["/transactions"]}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route
                    path="/transactions"
                    element={<CurrentLocation label="two" />}
                  />
                </Route>
              </Routes>
            </MemoryRouter>
          </AppSessionProvider>
        </div>
      </>,
    );

    const tabOne = screen.getByTestId("tab-one");
    const tabTwo = screen.getByTestId("tab-two");
    fireEvent.click(
      within(tabOne).getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );

    expect(within(tabOne).getByText("one:/transactions?spaceId=shared-1")).toBeTruthy();
    expect(within(tabTwo).getByText("two:/transactions")).toBeTruthy();
  });

  it("guards the real Space switcher while an editor has unsaved changes", () => {
    function DirtyEditorFixture() {
      const [draft, setDraft] = useState("Unsaved Transaction");
      const { dialog } = useUnsavedChangesNavigationGuard({
        enabled: draft.length > 0,
        focusScope: () =>
          document
            .querySelector<HTMLInputElement>('input[aria-label="Transaction draft"]')
            ?.closest<HTMLElement>("label") ?? null,
        focusTarget: () =>
          document.querySelector<HTMLInputElement>(
            'input[aria-label="Transaction draft"]',
          ),
        label: "Transaction",
        onDiscard: () => setDraft(""),
      });

      return (
        <>
          <label>
            Transaction draft
            <input
              aria-label="Transaction draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {dialog}
        </>
      );
    }

    function CurrentLocation() {
      const location = useLocation();
      return (
        <p data-testid="guarded-current-location">
          {`${location.pathname}${location.search}`}
        </p>
      );
    }

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions?spaceId=personal-1"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route
                path="/transactions"
                element={
                  <>
                    <DirtyEditorFixture />
                    <CurrentLocation />
                  </>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    const draft = screen.getByRole("textbox", { name: "Transaction draft" });
    draft.focus();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "Leave Transaction editor?" }),
    ).toBeTruthy();
    expect(screen.getByTestId("guarded-current-location").textContent).toBe(
      "/transactions",
    );

    fireEvent.click(screen.getByRole("button", { name: "Stay in editor" }));
    expect(screen.getByRole("textbox", { name: "Transaction draft" })).toHaveProperty(
      "value",
      "Unsaved Transaction",
    );
    expect(document.activeElement).toBe(draft);

    fireEvent.click(
      screen.getAllByRole("button", { name: /Active Space/u })[0]!,
    );
    fireEvent.click(
      screen.getByRole("menuitemradio", {
        name: /Shared.*Ada Lovelace.*Grace Hopper/u,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByTestId("guarded-current-location").textContent).toBe(
      "/transactions?spaceId=shared-1",
    );
  });

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
