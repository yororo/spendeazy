// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInPage } from "./sign-in-page";

const signInSso = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useSignIn: () => ({
    signIn: { sso: signInSso },
    errors: null,
    fetchStatus: "idle",
  }),
}));

afterEach(() => {
  cleanup();
  signInSso.mockClear();
});

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

  it("passes the invitation continuation through SSO", () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/sign-in?returnTo=%2Fsharing%3FinvitationToken%3Dinvitation-token",
        ]}
      >
        <SignInPage />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Continue with Google/u }),
    );

    expect(signInSso).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl: "/sharing?invitationToken=invitation-token",
      redirectCallbackUrl: "/sso-callback",
    });
  });
});
