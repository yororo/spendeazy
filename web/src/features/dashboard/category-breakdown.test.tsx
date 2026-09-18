// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryBreakdown } from "./category-breakdown";

afterEach(cleanup);

describe("CategoryBreakdown", () => {
  it("removes a previous custom Category when the Reporting Period changes", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const view = render(
      <CategoryBreakdown
        categories={[
          {
            id: "category-pets",
            category: "other",
            label: "Pets",
            color: "teal",
            amount: 80,
            share: 80,
          },
          {
            id: "category-gifts",
            category: "other",
            label: "Gifts",
            color: "rose",
            amount: 20,
            share: 20,
          },
        ]}
      />,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByText("Pets")).toBeTruthy();
    expect(screen.getByText("Gifts")).toBeTruthy();
    expect(
      screen
        .getByText("Pets")
        .parentElement?.querySelector('[aria-hidden="true"]')?.className,
    ).toContain("bg-category-teal");
    expect(
      screen
        .getByRole("img", { name: "Pets: 80% of monthly spending" })
        .firstElementChild?.className,
    ).toContain("bg-category-teal");

    view.rerender(
      <CategoryBreakdown
        categories={[
          {
            id: "category-gifts",
            category: "other",
            label: "Gifts",
            color: "rose",
            amount: 50,
            share: 100,
          },
        ]}
      />,
    );

    expect(screen.queryByText("Pets")).toBeNull();
    expect(screen.getByText("Gifts")).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
