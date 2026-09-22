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
