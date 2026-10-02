// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInPage, SsoCallbackPage } from "@/features/authentication";
import { initializeAppearance } from "@/components/app/appearance";
import { initializeTheme } from "@/components/app/theme";

const clerk = vi.hoisted(() => ({
  isLoaded: true,
  sso: vi.fn(),
  errors: null as null | { global: { message: string }[] },
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: clerk.isLoaded, isSignedIn: false }),
  useSignIn: () => ({
    signIn: { sso: clerk.sso },
    errors: clerk.errors,
    fetchStatus: "idle",
  }),
  AuthenticateWithRedirectCallback: () => <div>SSO callback mounted</div>,
}));

afterEach(() => {
  cleanup();
  clerk.isLoaded = true;
  clerk.errors = null;
  clerk.sso.mockReset();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("SignInPage", () => {
  for (const theme of ["technical", "playful"] as const) {
    for (const appearance of ["light", "dark", "system"] as const) {
      it(`retains saved ${theme}/${appearance} through auth loading, SSO action, error and callback`, () => {
        localStorage.setItem("spendeazy.theme", theme);
        localStorage.setItem("spendeazy.appearance", appearance);
        vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
        const disposeTheme = initializeTheme();
        const disposeAppearance = initializeAppearance();
        try {
          clerk.isLoaded = false;
          const view = render(<MemoryRouter initialEntries={["/sign-in?returnTo=%2Ftransactions"]}><SignInPage /></MemoryRouter>);
          expect(screen.getByRole("status").textContent).toContain("Securing your session");
          clerk.isLoaded = true;
          view.rerender(<MemoryRouter><SignInPage /></MemoryRouter>);
          fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
          expect(clerk.sso).toHaveBeenCalledWith({ strategy: "oauth_google", redirectUrl: "/transactions", redirectCallbackUrl: "/sso-callback" });
          clerk.errors = { global: [{ message: "Fictional sign-in failure" }] };
          view.rerender(<MemoryRouter><SignInPage /></MemoryRouter>);
          expect(screen.getByRole("alert").textContent).toBe("Fictional sign-in failure");
          view.rerender(<SsoCallbackPage />);
          expect(screen.getByRole("status").textContent).toContain("Securing your session");
          expect(screen.getByText("SSO callback mounted")).toBeTruthy();
          expect(document.documentElement.dataset.visualTheme).toBe(theme);
          expect(document.documentElement.dataset.theme).toBe(appearance === "light" ? "light" : "dark");
          expect(localStorage.getItem("spendeazy.theme")).toBe(theme);
          expect(localStorage.getItem("spendeazy.appearance")).toBe(appearance);
        } finally {
          disposeTheme();
          disposeAppearance();
        }
      });
    }
  }
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
