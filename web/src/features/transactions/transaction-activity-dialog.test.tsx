// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Transaction } from "./transactions-service";
import { TransactionActivityDialog } from "./transaction-activity-dialog";

const queryState = vi.hoisted(() => ({
  data: [] as readonly {
    readonly id: string;
    readonly transactionId: string;
    readonly type: "created";
    readonly actorUserId: string;
    readonly occurredAt: string;
  }[],
  isPending: false,
  isError: false,
  isSuccess: true,
  error: null as Error | null,
  refetch: vi.fn(async () => undefined),
}));

vi.mock("./transactions-queries", () => ({
  useTransactionActivityQuery: () => queryState,
}));

afterEach(() => {
  cleanup();
  queryState.data = [];
  queryState.isPending = false;
  queryState.isError = false;
  queryState.isSuccess = true;
  queryState.error = null;
  queryState.refetch.mockClear();
});

const transaction: Transaction = {
  id: "10",
  categoryId: null,
  purchaseDate: "2026-08-31",
  date: "Aug 31",
  description: "Legacy lunch",
  category: "other",
  categoryLabel: "Uncategorized",
  categoryColor: null,
  account: "Cash",
  amount: -10,
  source: "manual",
  statementImportId: null,
  addedByUserId: "7",
};

function renderDialog() {
  return render(
    <TransactionActivityDialog
      open
      transaction={transaction}
      spaceId="99"
      onOpenChange={vi.fn()}
    />,
  );
}

describe("TransactionActivityDialog", () => {
  it("explains legacy Transactions and retains Added By attribution", () => {
    renderDialog();

    expect(
      screen.getByText(/predates detailed activity capture/u),
    ).toBeTruthy();
    expect(screen.getByText("Added by User 7")).toBeTruthy();
  });

  it("renders loading and retryable error states", () => {
    queryState.isPending = true;
    queryState.isSuccess = false;
    renderDialog();
    expect(screen.getByRole("status")).toBeTruthy();
    cleanup();

    queryState.isPending = false;
    queryState.isError = true;
    queryState.error = new Error("Activity unavailable");
    renderDialog();
    expect(screen.getByText("Activity unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(queryState.refetch).toHaveBeenCalledOnce();
  });
});
