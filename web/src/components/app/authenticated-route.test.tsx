// @vitest-environment jsdom

import { useQuery } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedRoute } from "./authenticated-route";
import { useApiClient } from "@/shared/api";
import { AppSessionProvider, type AppSession } from "@/shared/session";

const sessionMock = vi.hoisted(() => ({
  getToken: vi.fn(),
  isLoaded: true,
  isSignedIn: true,
  sessionId: "session-1",
  signOut: vi.fn(),
}));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return {
    ...actual,
    readApiConfig: () => ({ baseUrl: "https://api.example.test" }),
  };
});

const validUser = {
  id: "42",
  name: "Ada Lovelace",
  email: "ada@example.test",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

type FetchMock = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthenticatedResponse(): Response {
  return jsonResponse(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
        details: [],
      },
    },
    401,
  );
}

function ProtectedRoute() {
  const apiClient = useApiClient();

  useQuery({
    queryKey: ["protected-route"],
    queryFn: () => apiClient.get("/protected"),
  });

  return <p>Protected route mounted</p>;
}

function SignInDestination() {
  const location = useLocation();
  const state = location.state as
    | { from?: { pathname?: string } }
    | null;

  return <p>Sign-in destination: {state?.from?.pathname ?? "unknown"}</p>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionMock.getToken.mockReset();
  sessionMock.signOut.mockReset();
});

describe("AuthenticatedRoute", () => {
  it("signs out after one rejected fresh-token replay and preserves the intended route", async () => {
    sessionMock.getToken.mockImplementation(
      async (options?: { skipCache?: boolean }) =>
        options?.skipCache ? "fresh-token" : "cached-token",
    );
    sessionMock.signOut.mockResolvedValue(undefined);
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(jsonResponse(validUser, 201))
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(unauthenticatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const session: AppSession = {
      isLoaded: sessionMock.isLoaded,
      isSignedIn: sessionMock.isSignedIn,
      sessionId: sessionMock.sessionId,
      user: null,
      getToken: sessionMock.getToken,
      openUserProfile: vi.fn(),
      signOut: sessionMock.signOut,
    };

    render(
      <AppSessionProvider session={session}>
        <MemoryRouter initialEntries={["/transactions"]}>
          <Routes>
            <Route element={<AuthenticatedRoute />}>
              <Route path="/transactions" element={<ProtectedRoute />} />
            </Route>
            <Route path="/sign-in" element={<SignInDestination />} />
          </Routes>
        </MemoryRouter>
      </AppSessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Sign-in destination: /transactions")).toBeTruthy(),
    );

    expect(sessionMock.signOut).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sessionMock.getToken).toHaveBeenLastCalledWith({ skipCache: true });
  });
});
