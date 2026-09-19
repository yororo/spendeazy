// @vitest-environment jsdom

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedQueryProvider } from "./authenticated-query-provider";
import { API_USER_PROFILE_QUERY_KEY } from "@/shared/api/user-profile-queries";
import type { UserProfile } from "@/shared/api/user-profile";
import { useApiClient } from "@/shared/api/use-api-client";

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));

const apiConfig = { baseUrl: "https://api.example.test" };
const validUser = {
  id: "42",
  name: "Ada Lovelace",
  email: "ada@example.test",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

type FetchResult = Response | Error;
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

function apiErrorResponse(message: string, status: number, code: string) {
  return jsonResponse({ error: { code, message, details: [] } }, status);
}

function createFetchMock(results: FetchResult[]) {
  return vi.fn<FetchMock>(() => {
    const result = results.shift();
    if (!result) throw new Error("The test response queue is empty.");
    if (result instanceof Error) return Promise.reject(result);

    return Promise.resolve(result);
  });
}

function BusinessRoute() {
  const apiClient = useApiClient();
  const query = useQuery({
    queryKey: ["business-route"],
    queryFn: ({ signal }) =>
      apiClient.get<{ owner?: string; ready: boolean }>("/business", {
        signal,
      }),
  });

  return query.isSuccess ? (
    <p>Business route mounted: {query.data?.owner ?? "unknown"}</p>
  ) : null;
}

function CachedProfile() {
  const queryClient = useQueryClient();
  const profile = queryClient.getQueryData<UserProfile>(
    API_USER_PROFILE_QUERY_KEY,
  );

  return profile ? <p>Cached profile: {profile.name}</p> : null;
}

function renderProvider(
  getToken: () => Promise<string | null>,
  children = <BusinessRoute />,
  sessionId = "session-1",
) {
  return render(
    <AuthenticatedQueryProvider
      apiConfig={apiConfig}
      getToken={getToken}
      sessionId={sessionId}
      onSignOut={signOutMock}
    >
      {children}
    </AuthenticatedQueryProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOutMock.mockClear();
});

describe("AuthenticatedQueryProvider", () => {
  it("waits for a token, provisions the User, and only then mounts business queries", async () => {
    let resolveToken: (token: string) => void = () => undefined;
    const tokenPromise = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const getToken = vi.fn(() => tokenPromise);
    const fetchMock = createFetchMock([
      jsonResponse(validUser, 201),
      jsonResponse({ ready: true }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderProvider(
      getToken,
      <>
        <CachedProfile />
        <BusinessRoute />
      </>,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Preparing your account",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Business route mounted")).toBeNull();

    resolveToken("session-token");

    await waitFor(() =>
      expect(screen.getByText("Business route mounted: unknown")).toBeTruthy(),
    );
    expect(screen.getByText("Cached profile: Ada Lovelace")).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me/business",
    );
    expect(getToken).toHaveBeenCalled();
  });

  it("keeps business routes unmounted after a terminal provisioning failure", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchMock = createFetchMock([
      apiErrorResponse("Provisioning conflict", 409, "CONFLICT"),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderProvider(getToken);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Provisioning conflict",
      ),
    );
    expect(screen.queryByText("Business route mounted")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after Retry and then mounts business routes", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchMock = createFetchMock([
      apiErrorResponse("Provisioning failed", 409, "CONFLICT"),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderProvider(getToken);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy(),
    );

    fetchMock.mockImplementationOnce(async () => jsonResponse(validUser));
    fetchMock.mockImplementationOnce(async () => jsonResponse({ ready: true }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByText("Business route mounted: unknown")).toBeTruthy(),
    );

    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
  });

  it("can sign out from a preparation failure", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchMock = createFetchMock([
      apiErrorResponse("Still unavailable", 404, "RESOURCE_NOT_FOUND"),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderProvider(getToken);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(signOutMock).toHaveBeenCalledOnce(),
    );
  });

  it("automatically retries a transient provisioning network failure once", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchMock = createFetchMock([
      new Error("Connection refused"),
      jsonResponse(validUser),
      jsonResponse({ ready: true }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderProvider(getToken);

    await waitFor(() =>
      expect(screen.getByText("Business route mounted: unknown")).toBeTruthy(),
    );

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
  });

  it("automatically retries a service-unavailable provisioning response once", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchMock = createFetchMock([
      apiErrorResponse("Temporarily unavailable", 503, "SERVICE_UNAVAILABLE"),
      jsonResponse(validUser),
      jsonResponse({ ready: true }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderProvider(getToken);

    await waitFor(() =>
      expect(screen.getByText("Business route mounted: unknown")).toBeTruthy(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
  });

  it("automatically retries a transient business read once", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchMock = createFetchMock([
      jsonResponse(validUser, 201),
      new Error("Connection refused"),
      jsonResponse({ ready: true, owner: "retried-read" }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderProvider(getToken);

    await waitFor(
      () =>
        expect(
          screen.getByText("Business route mounted: retried-read"),
        ).toBeTruthy(),
      { timeout: 3000 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
  });

  it("isolates provisioning and business data when the Clerk session changes", async () => {
    let resolveFirstBusiness: (response: Response) => void = () => undefined;
    const firstBusinessResponse = new Promise<Response>((resolve) => {
      resolveFirstBusiness = resolve;
    });
    const firstUser = { ...validUser, id: "42", name: "Ada Lovelace" };
    const secondUser = { ...validUser, id: "43", name: "Grace Hopper" };
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(jsonResponse(firstUser, 201))
      .mockImplementationOnce(() => firstBusinessResponse)
      .mockResolvedValueOnce(jsonResponse(secondUser, 201))
      .mockResolvedValueOnce(jsonResponse({ ready: true, owner: "session-2" }));
    let activeSession = "session-1";
    const getToken = vi.fn(async () => `${activeSession}-token`);
    vi.stubGlobal("fetch", fetchMock);

    const view = renderProvider(
      getToken,
      <>
        <CachedProfile />
        <BusinessRoute />
      </>,
      "session-1",
    );

    await waitFor(() =>
      expect(screen.getByText("Cached profile: Ada Lovelace")).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    activeSession = "session-2";
    view.rerender(
      <AuthenticatedQueryProvider
        apiConfig={apiConfig}
        getToken={getToken}
        sessionId="session-2"
      >
        <CachedProfile />
        <BusinessRoute />
      </AuthenticatedQueryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Cached profile: Grace Hopper")).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Business route mounted: session-2"),
      ).toBeTruthy(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer session-1-token");
    expect(
      new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer session-2-token");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me/business",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me",
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me/business",
    );
    expect(screen.queryByText("Cached profile: Ada Lovelace")).toBeNull();

    resolveFirstBusiness(jsonResponse({ ready: true, owner: "session-1" }));
    await Promise.resolve();
    expect(screen.queryByText("Business route mounted: session-1")).toBeNull();
  });

  it("does not send cancelled provisioning while Strict Mode initializes the session", async () => {
    let resolveFirstToken: (token: string) => void = () => undefined;
    const firstToken = new Promise<string>((resolve) => {
      resolveFirstToken = resolve;
    });
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockImplementationOnce(() => firstToken)
      .mockResolvedValue("session-token");
    const fetchMock = createFetchMock([
      jsonResponse(validUser, 201),
      jsonResponse({ ready: true, owner: "strict-mode" }),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <AuthenticatedQueryProvider
          apiConfig={apiConfig}
          getToken={getToken}
          sessionId="session-1"
        >
          <BusinessRoute />
        </AuthenticatedQueryProvider>
      </StrictMode>,
    );
    resolveFirstToken("session-token");

    await waitFor(() =>
      expect(
        screen.getByText("Business route mounted: strict-mode"),
      ).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("GET");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
