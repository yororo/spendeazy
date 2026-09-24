// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientProvider } from "@/shared/api";
import { buildFinancialQueryKey } from "@/shared/query";
import { AppSessionProvider, type AppSession } from "@/shared/session";

import { useSaveCategoryBudgetMutation } from "./categories-queries";

const getToken = async () => "test-token";
const originalVersion = "2026-09-01T00:00:00.000Z";

function createSession(userId: string): AppSession {
  return {
    isLoaded: true,
    isSignedIn: true,
    sessionId: `session-${userId}`,
    user: {
      id: userId,
      fullName: userId,
      firstName: userId,
      primaryEmail: `${userId}@example.test`,
    },
    getToken,
    openUserProfile: () => undefined,
    signOut: async () => undefined,
  };
}

function BudgetSaveProbe({ spaceId }: { readonly spaceId: string }) {
  const mutation = useSaveCategoryBudgetMutation();
  return (
    <>
      <button
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({
          categoryId: "42",
          amount: "50.00",
          spaceId,
          updatedAt: originalVersion,
        })}
      >
        Save Budget
      </button>
      <output>{mutation.status}</output>
    </>
  );
}

function BudgetSaveHarness({
  queryClient,
  userId,
  spaceId,
}: {
  readonly queryClient: QueryClient;
  readonly userId: string;
  readonly spaceId: string;
}) {
  return (
    <AppSessionProvider session={createSession(userId)}>
      <ApiClientProvider config={{ baseUrl: "https://api.example.test" }} getToken={getToken}>
        <QueryClientProvider client={queryClient}>
          <BudgetSaveProbe spaceId={spaceId} />
        </QueryClientProvider>
      </ApiClientProvider>
    </AppSessionProvider>
  );
}

function seedBudgetCaches(queryClient: QueryClient) {
  const scopes = [
    { identityId: "user-1", spaceId: "space-a" },
    { identityId: "user-1", spaceId: "space-b" },
    { identityId: "user-2", spaceId: "space-a" },
  ];
  return scopes.flatMap((scope) => {
    const keys = [
      buildFinancialQueryKey(scope, ["categories", "budget"], "42"),
      buildFinancialQueryKey(scope, ["dashboard"], { year: 2026, month: 9 }),
    ];
    return keys.map((key) => {
      const data = { amount: "25.00" };
      queryClient.setQueryData(key, data);
      return { key, scope, data };
    });
  });
}

const queryClients: QueryClient[] = [];

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      // A Budget save must still opt out of automatic write retries.
      mutations: { retry: 2, retryDelay: 0 },
    },
  });
  queryClients.push(queryClient);
  return queryClient;
}

afterEach(() => {
  cleanup();
  for (const queryClient of queryClients.splice(0)) queryClient.clear();
  vi.unstubAllGlobals();
});

describe("Budget save cache lifecycle", () => {
  it.each([
    { change: "Space", userId: "user-1", spaceId: "space-b" },
    { change: "User", userId: "user-2", spaceId: "space-a" },
  ])("keeps a pending save bound to its original scope after a $change switch", async ({ userId, spaceId }) => {
    let resolveResponse: (response: Response) => void = () => undefined;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(() => response);
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = createQueryClient();
    const caches = seedBudgetCaches(queryClient);
    const view = render(
      <BudgetSaveHarness queryClient={queryClient} userId="user-1" spaceId="space-a" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    view.rerender(
      <BudgetSaveHarness queryClient={queryClient} userId={userId} spaceId={spaceId} />,
    );
    for (const { key } of caches) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    }

    resolveResponse(new Response(JSON.stringify({
      id: "7",
      categoryId: "42",
      amount: "50.00",
      period: "monthly",
      updatedAt: "2026-09-02T00:00:00.000Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await screen.findByText("success");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me/spaces/space-a/categories/42/budget",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      amount: "50.00",
      period: "monthly",
      updatedAt: originalVersion,
    });
    for (const { key, scope } of caches) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(
        scope.identityId === "user-1" && scope.spaceId === "space-a",
      );
    }
  });

  it("leaves cached reads unchanged and does not retry a failed save", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ code: "INTERNAL_ERROR", message: "Budget save failed", details: [] }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = createQueryClient();
    const caches = seedBudgetCaches(queryClient);
    render(<BudgetSaveHarness queryClient={queryClient} userId="user-1" spaceId="space-a" />);

    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));
    await screen.findByText("error");

    expect(fetchMock).toHaveBeenCalledOnce();
    for (const { key, data } of caches) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
      expect(queryClient.getQueryData(key)).toEqual(data);
    }
  });
});
