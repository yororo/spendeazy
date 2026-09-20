// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
