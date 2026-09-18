// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatementDropZone } from "./statement-drop-zone";
import type { CategorizedStatement } from "./statement-categorizer";
import bdoFixture from "../../../docs/pdf-parser/bdo-amex-sample-extracted-text.txt?raw";
import eastwestFixture from "../../../docs/pdf-parser/eastwest-sample-extracted-text.txt?raw";
import gcashFixture from "../../../docs/pdf-parser/gcash-sample-extracted-text.txt?raw";
import {
  extractPdfPages,
  PdfExtractionError,
} from "./statement-parser/pdf-extractor";

vi.mock("./statement-parser/pdf-extractor", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("./statement-parser/pdf-extractor")
    >();

  return {
    ...actual,
    extractPdfPages: vi.fn(),
  };
});

function renderDropZone() {
  const onStatementCategorized = vi.fn<
    (file: File, statement: CategorizedStatement) => void
  >();

  render(
    <StatementDropZone
      categoryRules={[]}
      activeCategoryIds={new Set()}
      onStatementCategorized={onStatementCategorized}
    />,
  );

  return { onStatementCategorized };
}

function selectPdf(name = "statement.pdf") {
  const file = new File(["pdf"], name, { type: "application/pdf" });
  fireEvent.change(document.getElementById("statement-file")!, {
    target: { files: [file] },
  });
  return file;
}

const extractedStatement = [
  {
    pageNumber: 1,
    text: bdoFixture,
  },
];
const extractedGcashStatement = [
  {
    pageNumber: 1,
    text: gcashFixture,
  },
];
const extractedGcashRecipientStatement = [
  {
    pageNumber: 1,
    text: gcashFixture
      .replace(
        "Transfer from 09112334455 to 09676769174",
        "  tRaNsFeR   FrOm 09112334455    tO 09999999999  ",
      )
      .replace(
        "Transfer from 09112334455 to 09615687145",
        "Transfer from 09222222222 to 09999999999",
      )
      .replace(
        "Transfer from 09112334455 to 09985340613",
        "Transfer from 09112334455 to 099999999990",
      )
      .replaceAll("09676769174", "09999999999")
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StatementDropZone GCash recipient prompt", () => {
  it("asks for an optional GCash recipient number after provider recognition", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce(extractedGcashStatement);
    const { onStatementCategorized } = renderDropZone();

    selectPdf("monthly-wallet-export.pdf");

    expect(
      await screen.findByRole("dialog", {
        name: "Identify incoming GCash transfers",
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText("GCash mobile number (optional)")).toBe(
      document.activeElement,
    );
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it("provides the agreed GCash recipient copy and local privacy controls", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce(extractedGcashStatement);
    renderDropZone();
    selectPdf("wallet-export.pdf");

    const dialog = await screen.findByRole("dialog", {
      name: "Identify incoming GCash transfers",
    });
    expect(
      screen.getByText(
        "Enter your GCash mobile number to automatically mark transfers to you as Debit and exclude them from this import. If you skip, search for your number in the transactions and manually exclude transfers to you.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The number you enter is used only in your browser for this import; it is not saved or sent to our servers.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("11 digits starting with 09, e.g. 09999999999."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(
      dialog.querySelector("input")?.getAttribute("autocomplete"),
    ).toBe("off");
  });

  it.each([
    ["+63 format", "+639112334455"],
    ["wrong length", "0911233445"],
    ["wrong prefix", "08112334455"],
    ["letters", "09A12334455"],
    ["internal separators", "09112 334455"],
  ])("keeps an invalid %s in the GCash dialog", async (_case, value) => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce(extractedGcashStatement);
    const { onStatementCategorized } = renderDropZone();
    selectPdf("wallet-export.pdf");

    const dialog = await screen.findByRole("dialog", {
      name: "Identify incoming GCash transfers",
    });
    const input = screen.getByLabelText("GCash mobile number (optional)");
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Enter exactly 11 digits starting with 09."),
    ).toBeTruthy();
    expect(screen.getByRole("dialog", {
      name: "Identify incoming GCash transfers",
    })).toBe(dialog);
    expect(input).toHaveProperty("value", value);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input).toHaveProperty("disabled", false);
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it.each([
    ["Skip", () => fireEvent.click(screen.getByRole("button", { name: "Skip" }))],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
  ])("allows %s after invalid nonblank recipient input", async (_method, dismiss) => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce(extractedGcashStatement);
    const { onStatementCategorized } = renderDropZone();
    selectPdf("wallet-export.pdf");

    await screen.findByRole("dialog", {
      name: "Identify incoming GCash transfers",
    });
    fireEvent.change(screen.getByLabelText("GCash mobile number (optional)"), {
      target: { value: "+63999999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Enter exactly 11 digits starting with 09.");

    dismiss();

    await waitFor(() => {
      expect(onStatementCategorized).toHaveBeenCalledOnce();
    });
    expect(onStatementCategorized.mock.calls[0]?.[1].transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description:
            "Transfer from 09112334455 to 09676769174 [Ref. #: 5043775892919]",
          amount: -4000,
          isExcluded: false,
        }),
      ]),
    );
  });

  it("reclassifies only complete transfers to the supplied GCash recipient", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce(
      extractedGcashRecipientStatement,
    );
    const { onStatementCategorized } = renderDropZone();
    selectPdf("wallet-export.pdf");

    await screen.findByRole("dialog", {
      name: "Identify incoming GCash transfers",
    });
    fireEvent.change(screen.getByLabelText("GCash mobile number (optional)"), {
      target: { value: " 09999999999 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onStatementCategorized).toHaveBeenCalledOnce();
    });
    const statement = onStatementCategorized.mock.calls[0]?.[1];
    expect(statement.summary).toMatchObject({
      provider: "GCash",
      totalTransactions: 55,
      totalExtractedAmount: -25291.92,
    });

    const recipientTransfers = statement.transactions.filter((transaction) =>
      /Transfer from .+ to 09999999999 \[Ref\./iu.test(transaction.description),
    );
    expect(recipientTransfers).toEqual([
      expect.objectContaining({
        description:
          "tRaNsFeR FrOm 09112334455 tO 09999999999 [Ref. #: 5043775892919]",
        amount: 4000,
        isExcluded: true,
      }),
      expect.objectContaining({
        description:
          "Transfer from 09222222222 to 09999999999 [Ref. #: 5043898447762]",
        amount: 297,
        isExcluded: true,
      }),
      expect.objectContaining({
        description:
          "Transfer from 09112334455 to 09999999999 [Ref. #: 5044211321443]",
        amount: 1000,
        isExcluded: true,
      }),
    ]);

    expect(statement.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description:
            "Transfer from 09999999999 to 09112334455 [Ref. #: 3044589005853]",
          amount: -2000,
          isExcluded: false,
        }),
        expect.objectContaining({
          description:
            "Buy Load Transaction for 09999999999 [Ref. #: 5000073058896]",
          amount: -151,
          isExcluded: false,
        }),
        expect.objectContaining({
          description:
            "Transfer from 09112334455 to 099999999990 [Ref. #: 5044264821034]",
          amount: -2000,
          isExcluded: false,
        }),
      ]),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Browse files" })).toBe(
      document.activeElement,
    );
  });

  it.each([
    ["blank Continue", () => fireEvent.click(screen.getByRole("button", { name: "Continue" }))],
    ["Skip", () => fireEvent.click(screen.getByRole("button", { name: "Skip" }))],
    ["close", () => fireEvent.click(screen.getByRole("button", { name: "Close dialog" }))],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
  ])("continues without reclassification through %s", async (_method, dismiss) => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce(extractedGcashStatement);
    const { onStatementCategorized } = renderDropZone();
    selectPdf("wallet-export.pdf");

    await screen.findByRole("dialog", {
      name: "Identify incoming GCash transfers",
    });
    dismiss();

    await waitFor(() => {
      expect(onStatementCategorized).toHaveBeenCalledOnce();
    });
    const statement = onStatementCategorized.mock.calls[0]?.[1];
    expect(statement.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description:
            "Transfer from 09112334455 to 09676769174 [Ref. #: 5043775892919]",
          amount: -4000,
          isExcluded: false,
        }),
      ]),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not prefill the next GCash import after the prompt is completed", async () => {
    vi.mocked(extractPdfPages).mockResolvedValue(extractedGcashStatement);
    renderDropZone();

    selectPdf("first-wallet-export.pdf");
    const input = await screen.findByLabelText("GCash mobile number (optional)");
    fireEvent.change(input, { target: { value: "09676769174" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    selectPdf("second-wallet-export.pdf");
    expect(
      await screen.findByLabelText("GCash mobile number (optional)"),
    ).toHaveProperty("value", "");
  });

  it("opens the GCash recipient dialog only after a protected statement is unlocked", async () => {
    vi.mocked(extractPdfPages)
      .mockRejectedValueOnce(
        new PdfExtractionError("password", "Password required."),
      )
      .mockResolvedValueOnce(extractedGcashStatement);
    const { onStatementCategorized } = renderDropZone();
    selectPdf("protected-wallet-export.pdf");

    expect(
      await screen.findByRole("dialog", { name: "PDF password required" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", {
        name: "Identify incoming GCash transfers",
      }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("PDF password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(
      await screen.findByRole("dialog", {
        name: "Identify incoming GCash transfers",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: "PDF password required" }),
    ).toBeNull();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it("keeps the GCash prompt closed during incorrect-password retries", async () => {
    vi.mocked(extractPdfPages)
      .mockRejectedValueOnce(
        new PdfExtractionError("password", "Password required."),
      )
      .mockRejectedValueOnce(
        new PdfExtractionError("password", "Password required."),
      )
      .mockResolvedValueOnce(extractedGcashStatement);
    const { onStatementCategorized } = renderDropZone();
    selectPdf("protected-wallet-export.pdf");

    const password = await screen.findByLabelText("PDF password");
    fireEvent.change(password, { target: { value: "incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(
      await screen.findByText(
        "The password you entered is incorrect. Please try a different password.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", {
        name: "Identify incoming GCash transfers",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "PDF password required" }),
    ).toBeTruthy();

    fireEvent.change(password, { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(
      await screen.findByRole("dialog", {
        name: "Identify incoming GCash transfers",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: "PDF password required" }),
    ).toBeNull();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it("does not prompt for a GCash statement that fails reconciliation", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      {
        pageNumber: 1,
        text: gcashFixture.replace(
          /^Total Debit\s+26696\.92$/mu,
          "Total Debit 26696.91",
        ),
      },
    ]);
    const { onStatementCategorized } = renderDropZone();
    selectPdf("wallet-export.pdf");

    expect(
      await screen.findByText(
        /GCash E-Wallet statement validation failed:.*Total Debit plus Total Credit/u,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", {
        name: "Identify incoming GCash transfers",
      }),
    ).toBeNull();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

});

describe("StatementDropZone PDF password challenge", () => {
  it("continues without a password dialog when the selected PDF opens", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce(extractedStatement);
    const { onStatementCategorized } = renderDropZone();
    const file = selectPdf();

    await waitFor(() => {
      expect(onStatementCategorized).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ transactions: expect.any(Array) }),
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for a password only after the selected PDF requires one", async () => {
    vi.mocked(extractPdfPages).mockRejectedValueOnce(
      new PdfExtractionError(
        "password",
        'Unable to unlock PDF file "statement.pdf".',
      ),
    );
    renderDropZone();

    expect(screen.queryByLabelText("PDF password")).toBeNull();

    selectPdf();

    expect(
      await screen.findByRole("dialog", { name: "PDF password required" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("PDF password")).toBe(
      document.activeElement,
    );
  });

  it("opens the selected PDF with the exact password and continues", async () => {
    vi.mocked(extractPdfPages)
      .mockRejectedValueOnce(
        new PdfExtractionError(
          "password",
          'Unable to unlock PDF file "statement.pdf".',
        ),
      )
      .mockResolvedValueOnce(extractedStatement);
    const { onStatementCategorized } = renderDropZone();
    const file = selectPdf();
    const password = await screen.findByLabelText("PDF password");

    fireEvent.change(password, { target: { value: " secret " } });
    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(extractPdfPages).toHaveBeenLastCalledWith(file, " secret ");
    expect(onStatementCategorized).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        transactions: expect.any(Array),
      }),
    );
  });

  it("keeps an incorrect password selected for another attempt", async () => {
    vi.mocked(extractPdfPages).mockRejectedValue(
      new PdfExtractionError(
        "password",
        'Unable to unlock PDF file "statement.pdf".',
      ),
    );
    renderDropZone();
    selectPdf();
    const password = await screen.findByLabelText("PDF password");

    fireEvent.change(password, { target: { value: "incorrect" } });
    const openButton = screen.getByRole("button", { name: "Open PDF" });
    openButton.focus();
    fireEvent.click(openButton);

    expect(
      await screen.findByText(
        "The password you entered is incorrect. Please try a different password.",
      ),
    ).toBeTruthy();
    expect(password).toHaveProperty("value", "incorrect");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(password).toBe(document.activeElement);
    expect(password).toHaveProperty("selectionStart", 0);
    expect(password).toHaveProperty("selectionEnd", "incorrect".length);
  });

  it("abandons the challenged file and password when cancelled", async () => {
    vi.mocked(extractPdfPages).mockRejectedValue(
      new PdfExtractionError("password", "Password required."),
    );
    renderDropZone();
    selectPdf("first.pdf");
    const password = await screen.findByLabelText("PDF password");
    fireEvent.change(password, { target: { value: "first-secret" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Browse files" })).toBe(
      document.activeElement,
    );

    selectPdf("second.pdf");
    expect(await screen.findByLabelText("PDF password")).toHaveProperty(
      "value",
      "",
    );
  });

  it("locks the password dialog while the PDF is opening", async () => {
    let finishOpening!: (pages: typeof extractedStatement) => void;
    const opening = new Promise<typeof extractedStatement>((resolve) => {
      finishOpening = resolve;
    });
    vi.mocked(extractPdfPages)
      .mockRejectedValueOnce(
        new PdfExtractionError("password", "Password required."),
      )
      .mockReturnValueOnce(opening);
    renderDropZone();
    selectPdf();
    const password = await screen.findByLabelText("PDF password");
    fireEvent.change(password, { target: { value: "secret" } });

    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(
      await screen.findByRole("button", { name: "Opening PDF" }),
    ).toHaveProperty("disabled", true);
    expect(password).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Show password" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    finishOpening(extractedStatement);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("returns non-password failures to the Upload error area", async () => {
    vi.mocked(extractPdfPages)
      .mockRejectedValueOnce(
        new PdfExtractionError("password", "Password required."),
      )
      .mockRejectedValueOnce(
        new PdfExtractionError(
          "unreadable",
          'Unable to extract text from PDF file "statement.pdf".',
        ),
      );
    renderDropZone();
    selectPdf();
    const password = await screen.findByLabelText("PDF password");
    fireEvent.change(password, { target: { value: "secret" } });

    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(
      await screen.findByText(
        'Unable to extract text from PDF file "statement.pdf".',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Browse files" })).toBe(
      document.activeElement,
    );
  });

  it("keeps an initial non-password failure in the Upload error area", async () => {
    vi.mocked(extractPdfPages).mockRejectedValueOnce(
      new PdfExtractionError(
        "unreadable",
        'Unable to extract text from PDF file "statement.pdf".',
      ),
    );
    renderDropZone();

    selectPdf();

    expect(
      await screen.findByText(
        'Unable to extract text from PDF file "statement.pdf".',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("blocks an unsupported provider in the Upload error area", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      { pageNumber: 1, text: "BDO AMEX credit card (USD)" },
    ]);
    const { onStatementCategorized } = renderDropZone();

    selectPdf();

    expect(
      await screen.findByText(
        "Unsupported statement: no supported provider matched the statement.",
      ),
    ).toBeTruthy();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it("blocks an ambiguous provider match in the Upload error area", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      {
        pageNumber: 1,
        text: "BDO AMEX and EastWest Visa credit card statement in PHP",
      },
    ]);
    const { onStatementCategorized } = renderDropZone();

    selectPdf();

    expect(
      await screen.findByText(
        "Ambiguous statement: more than one provider matched the statement.",
      ),
    ).toBeTruthy();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it.each([
    ["BDO without AMEX evidence", "BDO credit card statement in PHP"],
    ["BDO without PHP evidence", "BDO AMEX credit card statement in USD"],
    ["EastWest Mastercard", "EastWest Mastercard statement in PHP"],
    ["EastWest without PHP evidence", "EastWest Visa statement in USD"],
    [
      "dual-currency EastWest with mixed currency evidence",
      "EastWest Visa dual-currency statement in PHP and USD",
    ],
  ])("blocks %s in the Upload error area", async (_case, firstPageText) => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      { pageNumber: 1, text: firstPageText },
    ]);
    const { onStatementCategorized } = renderDropZone();

    selectPdf();

    expect(
      await screen.findByText(/Unsupported statement:.*statement/i),
    ).toBeTruthy();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it("blocks BDO extraction-validation failures in the Upload error area", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      {
        pageNumber: 1,
        text: bdoFixture.replace("SUBTOTAL 5,471.00", "SUBTOTAL 5,470.99"),
      },
    ]);
    const { onStatementCategorized } = renderDropZone();

    selectPdf();

    expect(
      await screen.findByText(/BDO AMEX statement validation failed:.*subtotal/i),
    ).toBeTruthy();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it("accepts a BDO Reference separated from its Transaction by extraction whitespace", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      {
        pageNumber: 1,
        text: bdoFixture.replace(
          /(05\/19\/26 05\/20\/26 APPLE\.COM\/BILL HOLLYHILL IE 399\.00)\r?\n(Reference: MX5XGZW3XKA0)/u,
          "$1\n\n$2",
        ),
      },
    ]);
    const { onStatementCategorized } = renderDropZone();

    selectPdf();

    await waitFor(() => {
      expect(onStatementCategorized).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText(/orphan Reference/i)).toBeNull();
  });

  it.each([
    [
      "a malformed EastWest transaction",
      eastwestFixture.replace(
        "JUN 23 JUN 24 PETRON SERVICE STATION TAGUIG PHL 4,673.08",
        "JUN 23 JUN 24 malformed transaction row",
      ),
      /EastWest Visa statement validation failed:.*malformed transaction/i,
    ],
    [
      "an empty EastWest activity section",
      eastwestFixture.replace(
        /^[A-Z]{3}\s+\d{1,2}\s+[A-Z]{3}\s+\d{1,2}\s+.+$/gmu,
        "",
      ),
      /EastWest Visa statement validation failed:.*no Transactions/i,
    ],
    [
      "an unreconciled EastWest control",
      eastwestFixture.replace(
        "Plus: Purchases/Debits 36,161.16",
        "Plus: Purchases/Debits 36,161.15",
      ),
      /EastWest Visa statement validation failed:.*positive activity/i,
    ],
  ])("blocks %s in the Upload error area", async (_case, text, message) => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      { pageNumber: 1, text },
    ]);
    const { onStatementCategorized } = renderDropZone();

    selectPdf();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(onStatementCategorized).not.toHaveBeenCalled();
  });

  it.each([
    ["unsupported type", new File(["text"], "statement.txt"), "Choose a PDF file."],
    [
      "oversized PDF",
      Object.defineProperty(new File(["pdf"], "statement.pdf"), "size", {
        value: 26 * 1024 * 1024,
      }),
      "File must be 25 MB or smaller.",
    ],
  ])("rejects an %s without requesting a password", async (_case, file, message) => {
    renderDropZone();

    fireEvent.change(document.getElementById("statement-file")!, {
      target: { files: [file] },
    });

    expect(await screen.findByText(message)).toBeTruthy();
    expect(extractPdfPages).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    [
      "Close",
      () =>
        fireEvent.click(screen.getByRole("button", { name: "Close dialog" })),
    ],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    [
      "outside click",
      () => {
        const overlay = document.querySelector('[data-slot="dialog-overlay"]')!;
        fireEvent.pointerDown(overlay, { button: 0, ctrlKey: false });
        fireEvent.click(overlay);
      },
    ],
  ])("abandons the challenged file through %s", async (_method, dismiss) => {
    vi.mocked(extractPdfPages).mockRejectedValueOnce(
      new PdfExtractionError("password", "Password required."),
    );
    renderDropZone();
    selectPdf();
    await screen.findByRole("dialog");

    dismiss();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Browse files" })).toBe(
      document.activeElement,
    );
  });

  it("provides the designed password and privacy controls", async () => {
    vi.mocked(extractPdfPages).mockRejectedValueOnce(
      new PdfExtractionError("password", "Password required."),
    );
    renderDropZone();
    selectPdf();
    const password = await screen.findByLabelText("PDF password");

    expect(
      screen.getByRole("heading", {
        name: "This PDF is password protected",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Your password is used only to open this file and is never stored.",
      ),
    ).toBeTruthy();
    expect(password).toHaveProperty("type", "password");
    expect(screen.getByRole("button", { name: "Open PDF" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(password).toHaveProperty("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
  });
});
