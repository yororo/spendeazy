// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import App from "./App";

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
