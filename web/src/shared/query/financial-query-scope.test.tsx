// @vitest-environment jsdom

import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppSessionProvider, type AppSession } from "@/shared/session";

import {
  buildFinancialQueryKey,
  financialQueryOptions,
  useFinancialQueryScope,
} from "./financial-query-scope";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
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

interface ScopedReadProps {
  readonly spaceId: string;
  readonly responses: readonly Deferred<string>[];
  readonly requests: { scope: ReturnType<typeof useFinancialQueryScope>; signal: AbortSignal }[];
}

function ScopedRead({ spaceId, responses, requests }: ScopedReadProps) {
  const scope = useFinancialQueryScope(spaceId);
  const query = useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["probe"]),
    queryFn: ({ signal }) => {
      const response = responses[requests.length];
      if (!response) throw new Error("The test response queue is empty.");

      requests.push({ scope, signal });
      return response.promise;
    },
  });

  return (
    <>
      <p>{query.data ?? "Loading"}</p>
      <button type="button" onClick={() => void query.refetch()}>
        Refresh
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
});

describe("financial query scope", () => {
  it("separates Spaces and ignores a late previous-Space response", async () => {
    const initialSpaceResponse = createDeferred<string>();
    const lateSpaceResponse = createDeferred<string>();
    const nextSpaceResponse = createDeferred<string>();
    const responses = [
      initialSpaceResponse,
      lateSpaceResponse,
      nextSpaceResponse,
    ];
    const requests: ScopedReadProps["requests"] = [];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const session = createSession("user-1");
    const view = render(
      <AppSessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <ScopedRead
            spaceId="space-a"
            responses={responses}
            requests={requests}
          />
        </QueryClientProvider>
      </AppSessionProvider>,
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      initialSpaceResponse.resolve("Space A");
      await initialSpaceResponse.promise;
    });
    expect(await screen.findByText("Space A")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(requests).toHaveLength(2));

    view.rerender(
      <AppSessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <ScopedRead
            spaceId="space-b"
            responses={responses}
            requests={requests}
          />
        </QueryClientProvider>
      </AppSessionProvider>,
    );

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(screen.getByText("Loading")).toBeTruthy();
    expect(screen.queryByText("Space A")).toBeNull();
    expect(requests[1]?.signal.aborted).toBe(true);

    await act(async () => {
      lateSpaceResponse.resolve("Late Space A");
      await lateSpaceResponse.promise;
    });
    expect(screen.getByText("Loading")).toBeTruthy();
    expect(screen.queryByText("Late Space A")).toBeNull();

    await act(async () => {
      nextSpaceResponse.resolve("Space B");
      await nextSpaceResponse.promise;
    });
    expect(await screen.findByText("Space B")).toBeTruthy();
  });

  it("separates cached results when the authenticated identity changes", async () => {
    const firstResponse = createDeferred<string>();
    const secondResponse = createDeferred<string>();
    const responses = [firstResponse, secondResponse];
    const requests: ScopedReadProps["requests"] = [];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <AppSessionProvider session={createSession("user-1")}>
        <QueryClientProvider client={queryClient}>
          <ScopedRead
            spaceId="space-a"
            responses={responses}
            requests={requests}
          />
        </QueryClientProvider>
      </AppSessionProvider>,
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    view.rerender(
      <AppSessionProvider session={createSession("user-2")}>
        <QueryClientProvider client={queryClient}>
          <ScopedRead
            spaceId="space-a"
            responses={responses}
            requests={requests}
          />
        </QueryClientProvider>
      </AppSessionProvider>,
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]?.scope.identityId).toBe("user-1");
    expect(requests[1]?.scope.identityId).toBe("user-2");
    expect(requests[0]?.signal.aborted).toBe(true);

    await act(async () => {
      firstResponse.resolve("Old identity");
      await firstResponse.promise;
    });
    expect(screen.queryByText("Old identity")).toBeNull();

    await act(async () => {
      secondResponse.resolve("New identity");
      await secondResponse.promise;
    });
    expect(await screen.findByText("New identity")).toBeTruthy();
  });

  it("refreshes the selected scope on window focus and navigation mount", async () => {
    const initialResponse = createDeferred<string>();
    const focusResponse = createDeferred<string>();
    const mountResponse = createDeferred<string>();
    const responses = [initialResponse, focusResponse, mountResponse];
    const requests: ScopedReadProps["requests"] = [];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const session = createSession("user-1");
    const view = render(
      <AppSessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <ScopedRead
            spaceId="shared-space"
            responses={responses}
            requests={requests}
          />
        </QueryClientProvider>
      </AppSessionProvider>,
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => {
      initialResponse.resolve("Initial");
      await initialResponse.promise;
    });
    expect(await screen.findByText("Initial")).toBeTruthy();

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => {
      focusResponse.resolve("Focused");
      await focusResponse.promise;
    });
    expect(await screen.findByText("Focused")).toBeTruthy();

    view.unmount();
    render(
      <AppSessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <ScopedRead
            spaceId="shared-space"
            responses={responses}
            requests={requests}
          />
        </QueryClientProvider>
      </AppSessionProvider>,
    );
    await waitFor(() => expect(requests).toHaveLength(3));
    await act(async () => {
      mountResponse.resolve("Mounted");
      await mountResponse.promise;
    });
    expect(await screen.findByText("Mounted")).toBeTruthy();
  });
});
