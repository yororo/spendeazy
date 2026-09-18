// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInPage } from "./sign-in-page";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useSignIn: () => ({
    signIn: { sso: vi.fn() },
    errors: null,
    fetchStatus: "idle",
  }),
}));

afterEach(cleanup);

describe("SignInPage", () => {
  it("links to public legal pages without interrupting the SSO screen", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <SignInPage />
      </MemoryRouter>,
    );

    for (const path of ["/terms", "/privacy"]) {
      const link = screen.getByRole("link", {
        name: path === "/terms" ? "Terms of Service" : "Privacy Policy",
      });

      expect(link.getAttribute("href")).toBe(path);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }

    expect(screen.getByText(/By continuing, you agree to our/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
