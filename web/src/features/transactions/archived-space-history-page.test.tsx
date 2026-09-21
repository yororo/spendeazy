// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportingPeriodProvider } from "@/shared/reporting-period";

import { ArchivedSpaceHistoryPage } from "./archived-space-history-page";

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
}));

afterEach(() => {
  cleanup();
  pageState.lastTransactionQueryArgs = undefined;
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
    expect(pageState.lastTransactionQueryArgs?.slice(1)).toEqual([
      "archived-1",
      true,
    ]);
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
