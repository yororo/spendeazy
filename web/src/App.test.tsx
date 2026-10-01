// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, useSearchParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportingPeriodProvider } from "@/shared/reporting-period";

import App from "./App";

vi.mock("@/components/app/authenticated-route", () => ({
  AuthenticatedRoute: () => <Outlet />,
}));

vi.mock("@/layouts/app-shell", () => ({
  AppShell: () => <Outlet />,
}));

vi.mock("@/features/categories", () => ({
  CategoriesPage: ({
    spaceId,
    onSpaceChange,
  }: {
    readonly spaceId?: string;
    readonly onSpaceChange?: (spaceId?: string) => void;
  }) => (
    <>
      <p>Active Space: {spaceId ?? "personal"}</p>
      <button type="button" onClick={() => onSpaceChange?.("99")}>
        Select Shared Space
      </button>
    </>
  ),
}));

vi.mock("@/features/insights", () => ({
  InsightsPage: ({
    spaceId,
    onSpaceChange,
  }: {
    readonly spaceId?: string;
    readonly onSpaceChange?: (spaceId?: string) => void;
  }) => {
    const [searchParams] = useSearchParams();

    return (
      <>
        <p>Insights Space: {spaceId ?? "personal"}</p>
        <p>Insights query: {searchParams.toString()}</p>
        <button type="button" onClick={() => onSpaceChange?.("99")}>
          Select Insights Shared Space
        </button>
      </>
    );
  },
}));

afterEach(cleanup);

describe("public legal routes", () => {
  it.each([
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
  ])("renders %s without authentication", async (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: title, level: 1 }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).toBeNull();
  });
});

describe("Categories route Space selection", () => {
  it("reads and updates the scoped Space query parameter", async () => {
    render(
      <MemoryRouter initialEntries={["/categories?spaceId=10"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Active Space: 10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select Shared Space" }));

    expect(await screen.findByText("Active Space: 99")).toBeTruthy();
  });
});

describe("Insights route Space selection", () => {
  it("reads and updates the selected Space while retaining other URL parameters", async () => {
    render(
      <MemoryRouter initialEntries={["/insights?spaceId=10&view=monthly"]}>
        <ReportingPeriodProvider><App /></ReportingPeriodProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Insights Space: 10")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Select Insights Shared Space" }),
    );

    expect(await screen.findByText("Insights Space: 99")).toBeTruthy();
    expect(
      screen.getByText("Insights query: spaceId=99&view=monthly"),
    ).toBeTruthy();
  });
});
