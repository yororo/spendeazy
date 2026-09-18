import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./api-client";
import { getUserProfile } from "./user-profile";

const apiConfig = {
  baseUrl: "https://api.example.test",
};

const validUserProfile = {
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

function createFetchMock(response: Response) {
  return vi.fn<FetchMock>(() => Promise.resolve(response));
}

function createTokenGetter(token: string | null = "clerk-session-token") {
  return vi.fn(async () => token);
}

function apiErrorResponse(
  status: number,
  code: string,
  message = code,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        details: [],
      },
    }),
    { status },
  );
}

function userNotProvisionedResponse(): Response {
  return apiErrorResponse(
    403,
    "USER_NOT_PROVISIONED",
    "The User has not been provisioned.",
  );
}

describe("createApiClient", () => {
  it("builds a self-scoped authenticated request and decodes a successful response", async () => {
    const fetchMock = createFetchMock(
      new Response(JSON.stringify({ items: ["transaction"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const getToken = createTokenGetter();
    const client = createApiClient(apiConfig, getToken, fetchMock);

    const result = await client.get<{ items: string[] }>(
      "/transactions?fromDate=2026-08-01",
    );

    expect(result).toEqual({ items: ["transaction"] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getToken).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.example.test/api/v1/users/me/transactions?fromDate=2026-08-01",
    );
    expect(request?.method).toBe("GET");
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer clerk-session-token",
    );
    expect(new Headers(request?.headers).get("Accept")).toBe(
      "application/json",
    );
    expect(new Headers(request?.headers).has("Content-Type")).toBe(false);
  });

  it("preserves an ordinary 404 as a structured unavailable-resource error", async () => {
    const fetchMock = createFetchMock(
      new Response(
        JSON.stringify({
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "The requested resource was not found.",
            details: [],
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    const getToken = createTokenGetter();
    const client = createApiClient(apiConfig, getToken, fetchMock);

    await expect(client.get("/missing-resource")).rejects.toMatchObject({
      kind: "http",
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found.",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getToken).toHaveBeenCalledOnce();
  });

  it("repairs an exact missing User and replays a safe GET once", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: ["transaction"] }), {
          status: 200,
        }),
      );
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
      { sessionId: "session-1" },
    );

    await expect(client.get<{ items: string[] }>("/transactions")).resolves.toEqual({
      items: ["transaction"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
  });

  it.each([
    [403, "FORBIDDEN"],
    [400, "USER_NOT_PROVISIONED"],
  ] as const)(
    "does not repair a non-exact User provisioning response (%s %s)",
    async (status, code) => {
      const fetchMock = createFetchMock(apiErrorResponse(status, code));
      const client = createApiClient(
        apiConfig,
        createTokenGetter(),
        fetchMock,
        { sessionId: `session-non-exact-${status}-${code}` },
      );

      await expect(client.get("/transactions")).rejects.toMatchObject({
        kind: "http",
        status,
        code,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each(["HEAD", "OPTIONS"] as const)(
    "replays a safe %s request after provisioning",
    async (method) => {
      const fetchMock = vi
        .fn<FetchMock>()
        .mockResolvedValueOnce(userNotProvisionedResponse())
        .mockResolvedValueOnce(
          new Response(JSON.stringify(validUserProfile), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      const client = createApiClient(
        apiConfig,
        createTokenGetter(),
        fetchMock,
        { sessionId: `session-${method.toLowerCase()}` },
      );

      await expect(
        client.request("/transactions", { method }),
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe(method);
      expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
      expect(fetchMock.mock.calls[2]?.[1]?.method).toBe(method);
    },
  );

  it("withholds an unsafe mutation after repairing the User", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 201 }),
      );
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
      { sessionId: "session-unsafe-mutation" },
    );

    const error = await client
      .post("/transactions", { amount: "25.00" })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "recovery",
      code: "USER_PROVISIONED_RETRY_REQUIRED",
      message: "Your account is ready. Retry this action.",
      cause: {
        status: 403,
        code: "USER_NOT_PROVISIONED",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
  });

  it("replays an unsafe mutation only with explicit provisioning opt-in", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "transaction-1" }), { status: 201 }),
      );
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
      { sessionId: "session-opt-in" },
    );

    await expect(
      client.post<{ id: string }>(
        "/transactions",
        { amount: "25.00" },
        { replayAfterProvisioning: true },
      ),
    ).resolves.toEqual({ id: "transaction-1" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ amount: "25.00" }),
    );
  });

  it("shares one in-flight provisioning repair across clients in a Clerk session", async () => {
    let releaseInitialResponses: () => void = () => undefined;
    const initialResponsesReleased = new Promise<void>((resolve) => {
      releaseInitialResponses = resolve;
    });
    let initialRequestCount = 0;
    let provisioningRequestCount = 0;
    let resolveProvisioningStarted: () => void = () => undefined;
    const provisioningStarted = new Promise<void>((resolve) => {
      resolveProvisioningStarted = resolve;
    });
    let releaseProvisioning: () => void = () => undefined;
    const provisioningReleased = new Promise<void>((resolve) => {
      releaseProvisioning = resolve;
    });
    const fetchMock = vi.fn<FetchMock>(async (_, init) => {
      if (init?.method === "GET") {
        initialRequestCount += 1;
        if (initialRequestCount <= 2) {
          if (initialRequestCount === 2) releaseInitialResponses();
          await initialResponsesReleased;
          return userNotProvisionedResponse();
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (init?.method === "PUT") {
        provisioningRequestCount += 1;
        resolveProvisioningStarted();
        await provisioningReleased;
        return new Response(JSON.stringify(validUserProfile), { status: 201 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const getToken = createTokenGetter();
    const firstClient = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-shared-provisioning",
    });
    const secondClient = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-shared-provisioning",
    });

    const requests = [
      firstClient.get<{ ok: boolean }>("/transactions"),
      secondClient.get<{ ok: boolean }>("/categories"),
    ];
    await initialResponsesReleased;
    await provisioningStarted;

    expect(provisioningRequestCount).toBe(1);
    releaseProvisioning();

    await expect(Promise.all(requests)).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("shares a provisioning refresh stage with every waiting request", async () => {
    let getRequestCount = 0;
    let provisioningRequestCount = 0;
    const fetchMock = vi.fn<FetchMock>(async (_, init) => {
      if (init?.method === "GET") {
        getRequestCount += 1;
        if (getRequestCount <= 2) return userNotProvisionedResponse();
        if (getRequestCount === 3) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        return apiErrorResponse(401, "UNAUTHENTICATED");
      }

      provisioningRequestCount += 1;
      if (provisioningRequestCount === 1) {
        return apiErrorResponse(401, "UNAUTHENTICATED");
      }

      return new Response(JSON.stringify(validUserProfile), { status: 201 });
    });
    const getToken = vi.fn(
      async (options?: { skipCache?: boolean }) =>
        options?.skipCache ? "fresh-token" : "cached-token",
    );
    const onAuthenticationFailure = vi.fn(async () => undefined);
    const firstClient = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-shared-refresh-stage",
      onAuthenticationFailure,
    });
    const secondClient = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-shared-refresh-stage",
      onAuthenticationFailure,
    });

    const results = await Promise.allSettled([
      firstClient.get<{ ok: boolean }>("/transactions"),
      secondClient.get<{ ok: boolean }>("/categories"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(getToken).toHaveBeenCalledTimes(3);
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });
    expect(onAuthenticationFailure).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("returns the provisioning repair failure with the original 403 as its cause", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(
        apiErrorResponse(409, "CONFLICT", "Provisioning is unavailable."),
      );
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
      { sessionId: "session-repair-failure" },
    );

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "http",
      status: 409,
      code: "CONFLICT",
      message: "Provisioning is unavailable.",
      cause: {
        kind: "http",
        status: 403,
        code: "USER_NOT_PROVISIONED",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries one transient provisioning repair before replaying a safe read", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
      { sessionId: "session-transient-repair" },
    );

    await expect(client.get<{ ok: boolean }>("/transactions")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("GET");
  });

  it("retries one network-failed provisioning repair before replaying a safe read", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
      { sessionId: "session-network-repair" },
    );

    await expect(client.get<{ ok: boolean }>("/transactions")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("GET");
  });

  it("refreshes the token before provisioning when a request moves from 401 to 403", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(apiErrorResponse(401, "UNAUTHENTICATED"))
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const client = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-401-to-403",
    });

    await expect(client.get<{ ok: boolean }>("/transactions")).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("GET");
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
    expect(
      new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
  });

  it("refreshes the token during provisioning when a request moves from 403 to 401", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(apiErrorResponse(401, "UNAUTHENTICATED"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const client = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-403-to-401",
    });

    await expect(client.get<{ ok: boolean }>("/transactions")).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("GET");
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(
      new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
  });

  it("stops after a repaired request remains not provisioned", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(userNotProvisionedResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 201 }),
      )
      .mockResolvedValueOnce(userNotProvisionedResponse());
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
      { sessionId: "session-repeated-403" },
    );

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "recovery",
      status: 403,
      code: "USER_ACCOUNT_LINKING_FAILED",
      message: "Your account could not be linked. Try again or sign out.",
      cause: {
        status: 403,
        code: "USER_NOT_PROVISIONED",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
  });

  it("JSON-encodes mutation bodies while preserving the request method", async () => {
    const fetchMock = createFetchMock(new Response(JSON.stringify({ id: "7" })));
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
    );

    await client.post("/transactions", { amount: "25.00" });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe(JSON.stringify({ amount: "25.00" }));
    expect(new Headers(request?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("provisions the self-scoped User with a bodyless root PUT", async () => {
    const fetchMock = createFetchMock(
      new Response(JSON.stringify({ id: "42" }), { status: 201 }),
    );
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
    );

    await client.put("");

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.test/api/v1/users/me");
    expect(request?.method).toBe("PUT");
    expect(request?.body).toBeUndefined();
    expect(new Headers(request?.headers).has("Content-Type")).toBe(false);
  });

  it("supports the authenticated self-scoped root GET", async () => {
    const fetchMock = createFetchMock(
      new Response(JSON.stringify({ id: "42" }), { status: 200 }),
    );
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
    );

    await client.get("");

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.test/api/v1/users/me");
    expect(request?.method).toBe("GET");
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer clerk-session-token",
    );
  });

  it("rejects a successful response outside the caller's expected statuses", async () => {
    const fetchMock = createFetchMock(
      new Response(JSON.stringify({ id: "42" }), { status: 202 }),
    );
    const client = createApiClient(
      apiConfig,
      createTokenGetter(),
      fetchMock,
    );

    await expect(
      client.put("", undefined, { expectedStatuses: [200, 201] }),
    ).rejects.toMatchObject({
      kind: "http",
      status: 202,
    });
  });

  it("gets the current session token for each request", async () => {
    const fetchMock = vi.fn<FetchMock>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }))),
    );
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("token-a")
      .mockResolvedValueOnce("token-b");
    const client = createApiClient(apiConfig, getToken, fetchMock);

    await client.get("/transactions");
    await client.get("/categories");

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer token-a");
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer token-b");
  });

  it("refreshes a cached token once and replays the original mutation with the fresh token", async () => {
    const fetchMock = vi.fn<FetchMock>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "The cached token has expired.",
              details: [],
            },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "transaction-1" }), {
          status: 200,
        }),
      );
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const client = createApiClient(apiConfig, getToken, fetchMock);

    await expect(
      client.post<{ id: string }>("/transactions", { amount: "25.00" }),
    ).resolves.toEqual({ id: "transaction-1" });

    expect(getToken).toHaveBeenNthCalledWith(1);
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer cached-token");
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ amount: "25.00" }),
    );
  });

  it("refreshes bodyless User provisioning with the fresh token", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "The cached token has expired.",
              details: [],
            },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 201 }),
      );
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const client = createApiClient(apiConfig, getToken, fetchMock);

    await expect(
      client.put("", undefined, { expectedStatuses: [200, 201] }),
    ).resolves.toEqual(validUserProfile);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
  });

  it("refreshes current-profile retrieval with the fresh token", async () => {
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "The cached token has expired.",
              details: [],
            },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validUserProfile), { status: 200 }),
      );
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const client = createApiClient(apiConfig, getToken, fetchMock);

    await expect(getUserProfile(client)).resolves.toEqual(validUserProfile);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("GET");
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
  });

  it("coalesces concurrent unauthenticated responses into one fresh-token request", async () => {
    let releaseInitialResponses: () => void = () => undefined;
    const initialResponsesReleased = new Promise<void>((resolve) => {
      releaseInitialResponses = resolve;
    });
    let initialRequestCount = 0;
    const fetchMock = vi.fn<FetchMock>(async (_, init) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer cached-token") {
        initialRequestCount += 1;
        if (initialRequestCount === 2) releaseInitialResponses();
        await initialResponsesReleased;
        return new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "The cached token has expired.",
              details: [],
            },
          }),
          { status: 401 },
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    let resolveFreshToken: (token: string) => void = () => undefined;
    const freshToken = new Promise<string>((resolve) => {
      resolveFreshToken = resolve;
    });
    let resolveRefreshStarted: () => void = () => undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      resolveRefreshStarted = resolve;
    });
    const getToken = vi.fn((options?: { skipCache?: boolean }) => {
      if (options?.skipCache) {
        resolveRefreshStarted();
        return freshToken;
      }

      return Promise.resolve("cached-token");
    });
    const firstClient = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-1",
    });
    const secondClient = createApiClient(apiConfig, getToken, fetchMock, {
      sessionId: "session-1",
    });

    const requests = [
      firstClient.get<{ ok: boolean }>("/transactions"),
      secondClient.get<{ ok: boolean }>("/categories"),
    ];
    await initialResponsesReleased;
    await refreshStarted;

    expect(getToken).toHaveBeenCalledTimes(3);
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });

    resolveFreshToken("fresh-token");
    await expect(Promise.all(requests)).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls
        .slice(2)
        .every(
          ([, init]) =>
            new Headers(init?.headers).get("Authorization") ===
            "Bearer fresh-token",
        ),
    ).toBe(true);
  });

  it("notifies the application and does not replay when the fresh token is absent", async () => {
    const fetchMock = vi.fn<FetchMock>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHENTICATED",
              message: "The session is no longer valid.",
              details: [],
            },
          }),
          { status: 401 },
        ),
      ),
    );
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce(null);
    const onAuthenticationFailure = vi.fn(async () => undefined);
    const client = createApiClient(apiConfig, getToken, fetchMock, {
      onAuthenticationFailure,
    });

    await expect(client.get("/transactions")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(onAuthenticationFailure).toHaveBeenCalledOnce();
  });

  it("notifies the application after one rejected replay and never retries a second time", async () => {
    const unauthenticatedResponse = () =>
      new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required.",
            details: [],
          },
        }),
        { status: 401 },
      );
    const fetchMock = vi
      .fn<FetchMock>()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(unauthenticatedResponse());
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("cached-token")
      .mockResolvedValueOnce("fresh-token");
    const onAuthenticationFailure = vi.fn(async () => undefined);
    const client = createApiClient(apiConfig, getToken, fetchMock, {
      onAuthenticationFailure,
    });

    await expect(client.get("/transactions")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(onAuthenticationFailure).toHaveBeenCalledOnce();
  });

  it.each([
    ["a malformed response", new Response("not-json", { status: 401 })],
    [
      "a differently coded response",
      new Response(
        JSON.stringify({
          error: {
            code: "TOKEN_EXPIRED",
            message: "The token has expired.",
            details: [],
          },
        }),
        { status: 401 },
      ),
    ],
    [
      "an authentication code on a different status",
      new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required.",
            details: [],
          },
        }),
        { status: 403 },
      ),
    ],
  ] as const)("does not recover %s", async (_, response) => {
    const fetchMock = createFetchMock(response);
    const getToken = createTokenGetter();
    const onAuthenticationFailure = vi.fn(async () => undefined);
    const client = createApiClient(apiConfig, getToken, fetchMock, {
      onAuthenticationFailure,
    });

    await expect(client.get("/transactions")).rejects.toMatchObject({
      status: response.status,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getToken).toHaveBeenCalledOnce();
    expect(onAuthenticationFailure).not.toHaveBeenCalled();
  });

  it("does not send a private request when Clerk has no current session token", async () => {
    const fetchMock = createFetchMock(new Response(null, { status: 204 }));
    const getToken = createTokenGetter(null);
    const client = createApiClient(apiConfig, getToken, fetchMock);

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "authentication",
      code: "UNAUTHENTICATED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://attacker.example/transactions",
    "//attacker.example/transactions",
    "../transactions",
    "/transactions/../categories",
    "transactions/../../categories",
  ])("rejects a resource path that can escape the self-scoped boundary: %s", async (path) => {
    const fetchMock = createFetchMock(new Response(null, { status: 204 }));
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.get(path)).rejects.toMatchObject({
      kind: "request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the caller's AbortSignal to fetch and preserves cancellation", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("The request was cancelled.", "AbortError");
    const fetchMock = vi.fn<FetchMock>(() => Promise.reject(abortError));
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(
      client.get("/transactions", { signal: controller.signal }),
    ).rejects.toBe(abortError);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("does not send a request cancelled while the session token is loading", async () => {
    let resolveToken: (token: string) => void = () => undefined;
    const tokenPromise = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const getToken = vi.fn(() => tokenPromise);
    const fetchMock = createFetchMock(new Response(null, { status: 204 }));
    const client = createApiClient(apiConfig, getToken, fetchMock);
    const controller = new AbortController();

    const request = client.get("/transactions", {
      signal: controller.signal,
    });
    controller.abort();
    resolveToken("clerk-session-token");

    await expect(request).rejects.toBe(controller.signal.reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts successful empty responses", async () => {
    const fetchMock = createFetchMock(new Response(null, { status: 204 }));
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.delete("/transactions/7")).resolves.toBeUndefined();
  });

  it("retains structured API error codes and details", async () => {
    const fetchMock = createFetchMock(
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_FAILED",
            message: "The request contains invalid fields.",
            details: [
              {
                field: "/amount",
                code: "invalid_format",
                message: "Amount is invalid",
              },
            ],
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "http",
      status: 400,
      code: "VALIDATION_FAILED",
      details: [
        {
          field: "/amount",
          code: "invalid_format",
          message: "Amount is invalid",
        },
      ],
    });
  });

  it("retains authentication and service-unavailable API error codes", async () => {
    const responses = [
      new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required",
            details: [],
          },
        }),
        { status: 401 },
      ),
      new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required",
            details: [],
          },
        }),
        { status: 401 },
      ),
      new Response(
        JSON.stringify({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "The identity provider is temporarily unavailable",
            details: [],
          },
        }),
        { status: 503 },
      ),
    ];
    const fetchMock = vi.fn<FetchMock>(() =>
      Promise.resolve(responses.shift() ?? new Response(null, { status: 204 })),
    );
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "http",
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authentication required",
      details: [],
    });
    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "http",
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "The identity provider is temporarily unavailable",
      details: [],
    });
  });

  it("reports malformed successful responses explicitly", async () => {
    const fetchMock = createFetchMock(
      new Response("not-json", { status: 200 }),
    );
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "malformed-response",
      status: 200,
    });
  });

  it("reports network failures explicitly", async () => {
    const networkError = new Error("Connection refused");
    const fetchMock = vi.fn<FetchMock>(() => Promise.reject(networkError));
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "network",
      cause: networkError,
    });
  });

  it("reports response body network failures explicitly", async () => {
    const networkError = new Error("Connection reset");
    const response = {
      ok: true,
      status: 200,
      text: vi.fn(() => Promise.reject(networkError)),
    } as unknown as Response;
    const fetchMock = createFetchMock(response);
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.get("/transactions")).rejects.toMatchObject({
      kind: "network",
      status: 200,
      cause: networkError,
    });
  });

  it("preserves cancellation while reading a response body", async () => {
    const abortError = new DOMException(
      "The request was cancelled.",
      "AbortError",
    );
    const response = {
      ok: true,
      status: 200,
      text: vi.fn(() => Promise.reject(abortError)),
    } as unknown as Response;
    const fetchMock = createFetchMock(response);
    const client = createApiClient(apiConfig, createTokenGetter(), fetchMock);

    await expect(client.get("/transactions")).rejects.toBe(abortError);
  });
});
