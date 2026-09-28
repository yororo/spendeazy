// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportSuccess } from "./import-success";

afterEach(() => {
  cleanup();
});

describe("ImportSuccess importer attribution", () => {
  it("identifies the member who committed a Shared Statement Import", () => {
    render(
      <ImportSuccess
        committedImport={{
          id: "100",
          fileName: "shared-statement.pdf",
          statementDate: "2026-08-31",
          provider: "BDO",
          accountType: "AMEX",
          statementType: "credit_card",
          transactionHistoryStartDate: null,
          totalDebit: null,
          importedAt: "2026-09-01T00:00:00.000Z",
          transactionCount: 1,
          importedByUserId: "11",
        }}
        destinationLabel="Shared Space · Ada Lovelace & Grace Hopper"
        importerName="Grace Hopper"
        spaceId="99"
        onImportAnother={vi.fn()}
        onViewTransactions={vi.fn()}
      />,
    );

    expect(screen.getByText("Imported by")).toBeTruthy();
    expect(screen.getByText("Grace Hopper")).toBeTruthy();
  });

  it("keeps Personal completion concise without an importer field", () => {
    render(
      <ImportSuccess
        committedImport={{
          id: "100",
          fileName: "personal-statement.pdf",
          statementDate: "2026-08-31",
          provider: "BDO",
          accountType: "AMEX",
          statementType: "credit_card",
          transactionHistoryStartDate: null,
          totalDebit: null,
          importedAt: "2026-09-01T00:00:00.000Z",
          transactionCount: 1,
          importedByUserId: "10",
        }}
        destinationLabel="Personal Space · Ada Lovelace"
        spaceId={undefined}
        onImportAnother={vi.fn()}
        onViewTransactions={vi.fn()}
      />,
    );

    expect(screen.queryByText("Imported by")).toBeNull();
  });
});

describe("ImportSuccess E-Wallet controls", () => {
  it("shows the saved document period and original Total Debit", () => {
    render(
      <ImportSuccess
        committedImport={{
          id: "101",
          fileName: "wallet-history.pdf",
          statementDate: "2026-09-07",
          provider: "GCash",
          accountType: "E-Wallet",
          statementType: "e_wallet",
          transactionHistoryStartDate: "2026-08-09",
          totalDebit: 26696.92,
          importedAt: "2026-09-08T00:00:00.000Z",
          transactionCount: 3,
          importedByUserId: "10",
        }}
        onImportAnother={vi.fn()}
        onViewTransactions={vi.fn()}
      />,
    );

    expect(screen.getByText("Statement Type")).toBeTruthy();
    expect(screen.getByText("E-Wallet")).toBeTruthy();
    expect(screen.getByText("Transaction History Period")).toBeTruthy();
    expect(screen.getByText("Aug 09, 2026 – Sep 07, 2026")).toBeTruthy();
    expect(screen.getByText("Total Debit")).toBeTruthy();
    expect(screen.getByText("₱26,696.92")).toBeTruthy();
  });
});
