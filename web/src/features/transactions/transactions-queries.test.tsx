// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientProvider } from "@/shared/api";
import { AppSessionProvider, type AppSession } from "@/shared/session";

import { useCreateTransactionMutation } from "./transactions-queries";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

type FetchMock = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

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
    getToken: async () => "token",
    signOut: async () => undefined,
  };
}

function CreateTransactionProbe({ spaceId }: { readonly spaceId: string }) {
  const mutation = useCreateTransactionMutation();

  return (
    <button
      type="button"
      disabled={mutation.isPending}
      onClick={() => {
        void mutation.mutateAsync({
          spaceId,
          purchaseDate: "2026-09-01",
          description: "Dinner",
          amount: "25.00",
          categoryId: null,
        });
      }}
    >
      Save
    </button>
  );
}

function renderProbe(
  queryClient: QueryClient,
  session: AppSession,
  getToken: () => Promise<string>,
  spaceId: string,
) {
  return render(
    <AppSessionProvider session={session}>
      <ApiClientProvider
        config={{ baseUrl: "https://api.example.test" }}
        getToken={getToken}
      >
        <QueryClientProvider client={queryClient}>
          <CreateTransactionProbe spaceId={spaceId} />
        </QueryClientProvider>
      </ApiClientProvider>
    </AppSessionProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("transaction mutation scope", () => {
  it("keeps an in-flight write and its invalidation bound to its original identity and Space", async () => {
    const response = createDeferred<Response>();
    const fetchMock = vi.fn<FetchMock>(() => response.promise);
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const getToken = vi.fn(async () => "token");
    const view = renderProbe(
      queryClient,
      createSession("user-1"),
      getToken,
      "space-a",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    view.rerender(
      <AppSessionProvider session={createSession("user-2")}>
        <ApiClientProvider
          config={{ baseUrl: "https://api.example.test" }}
          getToken={getToken}
        >
          <QueryClientProvider client={queryClient}>
            <CreateTransactionProbe spaceId="space-b" />
          </QueryClientProvider>
        </ApiClientProvider>
      </AppSessionProvider>,
    );

    response.resolve(
      new Response(
        JSON.stringify({
          id: "transaction-1",
          categoryId: null,
          purchaseDate: "2026-09-01",
          description: "Dinner",
          amount: "25.00",
          source: "manual",
          updatedAt: "2026-09-01T00:00:00.000Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(10));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/users/me/spaces/space-a/transactions",
    );
    const invalidatedKeys = invalidateQueries.mock.calls.map(
      ([filters]) => filters?.queryKey,
    );
    expect(
      invalidatedKeys.every(
        (queryKey) =>
          queryKey?.[queryKey.length - 2] === "user-1" &&
          queryKey?.[queryKey.length - 1] === "space-a",
      ),
    ).toBe(true);
    expect(invalidatedKeys).not.toContainEqual([
      "dashboard",
      "user-2",
      "space-b",
    ]);
  });
});
