// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportingPeriodProvider } from "@/shared/reporting-period";
import {
  NavigationGuardProvider,
  useNavigationGuard,
  type NavigationAction,
} from "@/shared/navigation";

import { TransactionsPage } from "./transactions-page";
import type { Transaction, TransactionActivity } from "./transactions-service";

HTMLElement.prototype.scrollIntoView = vi.fn();

const pageState = vi.hoisted(() => {
  const updatedAt = "2026-08-31T00:00:00.000Z";
  const manualTransaction = {
    id: "manual-1",
    categoryId: "42",
    purchaseDate: "2026-08-03",
    date: "Aug 03",
    description: "Coffee",
    category: "housing" as const,
    categoryLabel: "Housing",
    categoryColor: "plum" as const,
    account: "Cash",
    amount: -4.5,
    source: "manual" as const,
    statementImportId: null,
    updatedAt,
    addedByUserId: "7",
  };
  const importedTransaction = {
    id: "imported-1",
    categoryId: null,
    purchaseDate: "2026-08-04",
    date: "Aug 04",
    description: "Lunch",
    category: "uncategorized" as const,
    categoryLabel: "Uncategorized",
    categoryColor: null,
    account: "BDO",
    amount: -10,
    source: "imported" as const,
    statementImportId: "100",
    updatedAt,
    addedByUserId: "8",
  };

  return {
    spacesQuery: {
      data: [
        {
          id: "10",
          kind: "personal" as const,
          status: "active" as const,
          accessLevel: "write" as const,
          members: [{ id: "1", name: "Ada Lovelace" }],
          createdAt: updatedAt,
          updatedAt,
        },
        {
          id: "99",
          kind: "shared" as const,
          status: "active" as const,
          accessLevel: "write" as const,
          members: [
            { id: "1", name: "Ada Lovelace" },
            { id: "2", name: "Grace Hopper" },
          ],
          createdAt: updatedAt,
          updatedAt,
        },
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
      error: new Error("Spaces unavailable"),
      refetch: vi.fn(async () => undefined),
    },
    transactionQuery: {
      data: {
        pages: [
          {
            items: [manualTransaction, importedTransaction],
            nextCursor: null,
            summary: {
              period: "Aug 2026",
              transactionCount: 2,
              totalExpense: 14.5,
            },
            categories: [
              {
                id: "42",
                name: "Housing",
                description: null,
                color: "plum" as const,
                isActive: true,
              },
              {
                id: "43",
                name: "Groceries",
                description: null,
                color: "forest" as const,
                isActive: true,
              },
            ],
          },
        ],
      },
      hasNextPage: false,
      isFetching: false,
      isPlaceholderData: false,
      isPending: false,
      isError: false,
      refetch: vi.fn(async () => undefined),
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
    createMutation: {
      error: null,
      isPending: false,
      mutateAsync: vi.fn(async () => undefined),
    },
    updateMutation: {
      error: null,
      isPending: false,
      mutateAsync: vi.fn(async () => undefined),
    },
    deleteMutation: {
      error: null,
      isPending: false,
      mutateAsync: vi.fn(async () => undefined),
      reset: vi.fn(),
    },
    activityQuery: {
      data: [
        {
          id: "activity-1",
          transactionId: "manual-1",
          type: "created" as const,
          actorUserId: "7",
          occurredAt: "2026-08-31T00:00:00.000Z",
        },
      ] as TransactionActivity[],
      isPending: false,
      isError: false,
      error: null,
      isSuccess: true,
      refetch: vi.fn(async () => undefined),
    },
    lastTransactionQueryArgs: undefined as
      | [string, string | undefined, boolean]
      | undefined,
  };
});

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
  useCreateTransactionMutation: () => pageState.createMutation,
  useUpdateTransactionMutation: () => pageState.updateMutation,
  useDeleteTransactionMutation: () => pageState.deleteMutation,
  useTransactionActivityQuery: () => pageState.activityQuery,
}));

afterEach(() => {
  cleanup();
  pageState.spacesQuery.isError = false;
  pageState.spacesQuery.isSuccess = true;
  pageState.spacesQuery.refetch.mockClear();
  pageState.createMutation.mutateAsync.mockClear();
  pageState.updateMutation.mutateAsync.mockClear();
  pageState.deleteMutation.mutateAsync.mockClear();
  pageState.activityQuery.refetch.mockClear();
  pageState.activityQuery.data = [
    {
      id: "activity-1",
      transactionId: "manual-1",
      type: "created",
      actorUserId: "7",
      occurredAt: "2026-08-31T00:00:00.000Z",
    },
  ];
  pageState.transactionQuery.refetch.mockClear();
  pageState.deletedTransactionQuery.refetch.mockClear();
  pageState.deletedTransactionQuery.fetchNextPage.mockClear();
  pageState.deletedTransactionQuery.data.pages[0].items = [];
  pageState.lastTransactionQueryArgs = undefined;
});

function NavigationProbe({ onNavigate }: { readonly onNavigate: () => void }) {
  const { requestNavigation } = useNavigationGuard();

  return (
    <button
      type="button"
      onClick={() => {
        if (!requestNavigation(onNavigate)) onNavigate();
      }}
    >
      Switch Space
    </button>
  );
}

function renderPage(options: { readonly onNavigate?: NavigationAction } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <NavigationGuardProvider>
      <QueryClientProvider client={queryClient}>
        <ReportingPeriodProvider>
          <TransactionsPage spaceId="99" onSpaceChange={vi.fn()} />
          {options.onNavigate && (
            <NavigationProbe onNavigate={options.onNavigate} />
          )}
        </ReportingPeriodProvider>
      </QueryClientProvider>
    </NavigationGuardProvider>,
  );
}

describe("TransactionsPage", () => {
  it("blocks transaction queries when accessible Spaces cannot be loaded", () => {
    pageState.spacesQuery.isError = true;
    pageState.spacesQuery.isSuccess = false;

    renderPage();

    expect(screen.getByText("Spaces unavailable")).toBeTruthy();
    expect(pageState.lastTransactionQueryArgs?.[2]).toBe(false);
    expect(screen.queryByRole("heading", { name: "Your spending" })).toBeNull();
  });

  it("records, edits, categorizes, and deletes transactions in the selected Space", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Your spending" })).toBeTruthy();
    expect(screen.getAllByText("Added by User 7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Added by User 8").length).toBeGreaterThan(0);
    expect(pageState.lastTransactionQueryArgs?.[1]).toBe("99");

    fireEvent.click(
      screen.getByRole("button", { name: "View activity for Coffee" }),
    );
    const activityDialog = screen.getByRole("dialog");
    expect(
      within(activityDialog).getByText("Created by User 7"),
    ).toBeTruthy();
    fireEvent.click(
      within(activityDialog).getByRole("button", { name: "Close" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
    const createDialog = screen.getByRole("dialog");
    fireEvent.change(within(createDialog).getByLabelText("Purchase date"), {
      target: { value: "2026-08-05" },
    });
    fireEvent.change(within(createDialog).getByLabelText("Description"), {
      target: { value: "Dinner" },
    });
    fireEvent.change(within(createDialog).getByLabelText("Amount"), {
      target: { value: "25.00" },
    });
    fireEvent.click(
      within(createDialog).getByRole("button", { name: "Record Transaction" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pageState.createMutation.mutateAsync).toHaveBeenCalledWith({
      spaceId: "99",
      purchaseDate: "2026-08-05",
      description: "Dinner",
      amount: "25.00",
      categoryId: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit Coffee" }));
    const editDialog = screen.getByRole("dialog");
    fireEvent.change(within(editDialog).getByLabelText("Description"), {
      target: { value: "Coffee shop" },
    });
    fireEvent.click(
      within(editDialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pageState.updateMutation.mutateAsync).toHaveBeenCalledWith({
      spaceId: "99",
      transactionId: "manual-1",
      purchaseDate: "2026-08-03",
      description: "Coffee shop",
      amount: "4.50",
      categoryId: "42",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    const categoryDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(categoryDialog).getByRole("combobox", {
        name: "Category",
      }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Groceries" }));
    fireEvent.click(
      within(categoryDialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pageState.updateMutation.mutateAsync).toHaveBeenLastCalledWith({
      spaceId: "99",
      transactionId: "imported-1",
      categoryId: "43",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Coffee" }));
    const deleteDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(deleteDialog).getByRole("button", { name: "Delete Transaction" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pageState.deleteMutation.mutateAsync).toHaveBeenCalledWith({
      spaceId: "99",
      transactionId: "manual-1",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
  });

  it("protects a dirty Transaction editor during a requested Space switch", async () => {
    const onNavigate = vi.fn();
    renderPage({ onNavigate });

    await screen.findByRole("heading", { name: "Your spending" });
    fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
    const editor = screen.getByRole("dialog", { name: "Record Transaction" });
    const description = within(editor).getByLabelText("Description");
    fireEvent.change(description, {
      target: { value: "Unsaved dinner" },
    });
    description.focus();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch Space", hidden: true }),
    );
    expect(
      screen.getByRole("dialog", { name: "Leave Transaction editor?" }),
    ).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stay in editor" }));
    expect(screen.getByRole("dialog", { name: "Record Transaction" })).toBeTruthy();
    expect(
      within(screen.getByRole("dialog", { name: "Record Transaction" })).getByLabelText(
        "Description",
      ),
    ).toHaveProperty("value", "Unsaved dinner");
    expect(document.activeElement).toBe(description);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch Space", hidden: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows retained deleted Transactions and their deletion activity", async () => {
    pageState.deletedTransactionQuery.data.pages[0].items = [
      {
        ...pageState.transactionQuery.data.pages[0].items[0],
        deletedAt: "2026-09-02T00:00:00.000Z",
      } as Transaction,
    ];
    pageState.activityQuery.data = [
      {
        id: "activity-deleted",
        transactionId: "manual-1",
        type: "deleted",
        actorUserId: "9",
        occurredAt: "2026-09-02T00:00:00.000Z",
      },
    ];

    renderPage();

    expect(await screen.findByRole("heading", { name: "Deleted Transactions" })).toBeTruthy();
    const activityButtons = screen.getAllByRole("button", {
      name: "View activity for Coffee",
    });
    fireEvent.click(activityButtons.at(-1)!);

    expect(within(screen.getByRole("dialog")).getByText("Deleted by User 9")).toBeTruthy();
  });
});
