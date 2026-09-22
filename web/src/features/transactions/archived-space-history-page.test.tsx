// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportingPeriodProvider } from "@/shared/reporting-period";

import { ArchivedSpaceHistoryPage } from "./archived-space-history-page";
import type { Transaction, TransactionActivity } from "./transactions-service";

const pageState = vi.hoisted(() => ({
  spacesQuery: {
    data: [
      {
        id: "personal-1",
        kind: "personal" as const,
        status: "active" as const,
        accessLevel: "write" as const,
        members: [{ id: "user-1", name: "Ada Lovelace" }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "archived-1",
        kind: "shared" as const,
        status: "archived" as const,
        accessLevel: "read" as const,
        members: [
          { id: "user-1", name: "Ada Lovelace" },
          { id: "user-3", name: "Katherine Johnson" },
        ],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  },
  transactionQuery: {
    data: {
      pages: [
        {
          items: [
            {
              id: "transaction-1",
              categoryId: null,
              purchaseDate: "2026-09-03",
              date: "Sep 03",
              description: "Archived dinner",
              category: "uncategorized" as const,
              categoryLabel: "Uncategorized",
              categoryColor: null,
              account: "Cash",
              amount: -24,
              source: "manual" as const,
              statementImportId: null,
              addedByUserId: "user-3",
            },
          ],
          nextCursor: null,
          summary: {
            period: "Sep 2026",
            transactionCount: 1,
            totalExpense: 24,
          },
          categories: [],
        },
      ],
    },
    hasNextPage: false,
    isFetching: false,
    isPlaceholderData: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  deletedTransactionQuery: {
    data: {
      pages: [
        {
          items: [] as Transaction[],
          nextCursor: null,
        },
      ],
    },
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: new Error("Deleted Transactions unavailable"),
    refetch: vi.fn(async () => undefined),
    fetchNextPage: vi.fn(async () => undefined),
  },
  activityQuery: {
    data: [
      {
        id: "activity-1",
        transactionId: "transaction-1",
        type: "created" as const,
        actorUserId: "user-3",
        occurredAt: "2026-09-03T00:00:00.000Z",
      },
    ] as TransactionActivity[],
    isPending: false,
    isError: false,
    error: null,
    isSuccess: true,
    refetch: vi.fn(),
  },
  lastTransactionQueryArgs: undefined as
    | [string, string | undefined, boolean]
    | undefined,
}));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();

  return {
    ...actual,
    useAccessibleSpacesQuery: () => pageState.spacesQuery,
  };
});

vi.mock("./transactions-queries", () => ({
  useTransactionsQuery: (
    period: string,
    spaceId: string | undefined,
    enabled: boolean,
  ) => {
    pageState.lastTransactionQueryArgs = [period, spaceId, enabled];
    return pageState.transactionQuery;
  },
  useDeletedTransactionsQuery: () => pageState.deletedTransactionQuery,
  useTransactionActivityQuery: () => pageState.activityQuery,
}));

afterEach(() => {
  cleanup();
  pageState.lastTransactionQueryArgs = undefined;
  pageState.activityQuery.data = [
    {
      id: "activity-1",
      transactionId: "transaction-1",
      type: "created",
      actorUserId: "user-3",
      occurredAt: "2026-09-03T00:00:00.000Z",
    },
  ];
  pageState.deletedTransactionQuery.data.pages[0].items = [];
});

function renderPage(initialEntry = "/history") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReportingPeriodProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ArchivedSpaceHistoryPage />
        </MemoryRouter>
      </ReportingPeriodProvider>
    </QueryClientProvider>,
  );
}

describe("ArchivedSpaceHistoryPage", () => {
  it("shows archived Shared Spaces separately with identity and read-only status", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Space history" })).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: /View history for Shared.*Katherine Johnson/u,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Read-only history")).toBeTruthy();
    expect(screen.queryByText("Personal · Ada Lovelace")).toBeNull();
    expect(pageState.lastTransactionQueryArgs?.[2]).toBe(false);
  });

  it("opens an archived Space as read-only financial history", () => {
    renderPage("/history?spaceId=archived-1");

    expect(
      screen.getByRole("heading", { name: "Archived Space history" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Archived dinner")).toHaveLength(2);
    expect(screen.getByText("Read-only history")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record Transaction" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit Archived dinner" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete Archived dinner" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "View activity for Archived dinner" }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText("Created by Katherine Johnson"),
    ).toBeTruthy();
    expect(pageState.lastTransactionQueryArgs?.slice(1)).toEqual([
      "archived-1",
      true,
    ]);
  });

  it("shows retained deleted Transactions and their deletion activity", () => {
    pageState.deletedTransactionQuery.data.pages[0].items = [
      {
        ...pageState.transactionQuery.data.pages[0].items[0],
        deletedAt: "2026-09-05T00:00:00.000Z",
      } as unknown as Transaction,
    ];
    pageState.activityQuery.data = [
      {
        id: "activity-deleted",
        transactionId: "transaction-1",
        type: "deleted",
        actorUserId: "user-1",
        occurredAt: "2026-09-05T00:00:00.000Z",
      },
    ];

    renderPage("/history?spaceId=archived-1");

    expect(
      screen.getByRole("heading", { name: "Deleted Transactions" }),
    ).toBeTruthy();
    const activityButtons = screen.getAllByRole("button", {
      name: "View activity for Archived dinner",
    });
    fireEvent.click(activityButtons.at(-1)!);
    expect(
      within(screen.getByRole("dialog")).getByText("Deleted by Ada Lovelace"),
    ).toBeTruthy();
  });

  it("selects an archive without changing the active financial route", () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("link", {
        name: /View history for Shared.*Katherine Johnson/u,
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Archived Space history" }),
    ).toBeTruthy();
    expect(screen.queryByText("/history?spaceId=archived-1")).toBeNull();
  });
});
