// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { MobileTabBar } from "./mobile-tab-bar";

afterEach(cleanup);

function CurrentLocation() {
  const location = useLocation();

  return <output>{`${location.pathname}${location.search}`}</output>;
}

describe("MobileTabBar", () => {
  it("replaces Categories with Insights and preserves the selected Space", () => {
    render(
      <MemoryRouter initialEntries={["/transactions?spaceId=shared-7"]}>
        <MobileTabBar />
        <CurrentLocation />
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });

    expect(within(navigation).getAllByRole("link")).toHaveLength(4);
    expect(within(navigation).queryByRole("link", { name: "Categories" })).toBeNull();

    fireEvent.click(within(navigation).getByRole("link", { name: "Insights" }));

    expect(screen.getByText("/insights?spaceId=shared-7")).toBeTruthy();
  });
});
