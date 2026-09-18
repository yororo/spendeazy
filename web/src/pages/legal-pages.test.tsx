// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PrivacyPolicyPage, TermsOfServicePage } from "./legal-pages";

afterEach(cleanup);

describe("legal pages", () => {
  it("presents the Privacy Policy with local PDF handling and operator contact", () => {
    render(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Privacy Policy", level: 1 }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /PDF bytes and any optional PDF password stay on your device/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Manila, Philippines")).toBeTruthy();
    expect(screen.getAllByText("September 2026").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/essential cookies or similar browser technologies/i),
    ).toBeTruthy();
    expect(
      screen.getAllByText("seanalvinyoro@gmail.com").length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: "Terms of Service" })
        .some((link) => link.getAttribute("href") === "/terms"),
    ).toBe(true);
  });

  it("presents the Terms of Service with the agreed financial disclaimer", () => {
    render(
      <MemoryRouter>
        <TermsOfServicePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Terms of Service", level: 1 }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Spendeazy is not financial, investment, tax, or legal advice/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Philippine law/i)).toBeTruthy();
    expect(screen.getByText(/at least 18 years old/i)).toBeTruthy();
    expect(screen.getByText(/You retain your rights/i)).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Privacy Policy" })
        .some((link) => link.getAttribute("href") === "/privacy"),
    ).toBe(true);
  });
});
