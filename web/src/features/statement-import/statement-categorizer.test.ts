import { describe, expect, it, vi } from "vitest";

import bdoFixture from "../../../docs/pdf-parser/bdo-amex-sample-extracted-text.txt?raw";
import eastwestFixture from "../../../docs/pdf-parser/eastwest-sample-extracted-text.txt?raw";
import gcashFixture from "../../../docs/pdf-parser/gcash-sample-extracted-text.txt?raw";

import { categorizeStatement } from "./statement-categorizer";
import { extractPdfPages } from "./statement-parser/pdf-extractor";
import { moneyToCents } from "@/shared/money";

vi.mock("./statement-parser/pdf-extractor", () => ({
  extractPdfPages: vi.fn(async () => [{ pageNumber: 1, text: bdoFixture }]),
}));

function categorizeFixture(text: string) {
  vi.mocked(extractPdfPages).mockResolvedValueOnce([{ pageNumber: 1, text }]);

  return categorizeStatement(
    new File(["statement"], "statement.pdf", { type: "application/pdf" }),
  );
}

function categorizePages(
  pages: readonly { pageNumber: number; text: string }[],
) {
  vi.mocked(extractPdfPages).mockResolvedValueOnce([...pages]);

  return categorizeStatement(
    new File(["statement"], "statement.pdf", { type: "application/pdf" }),
  );
}

describe("categorizeStatement", () => {
  it("normalizes provider signs and aggregates the complete BDO AMEX fixture", async () => {
    const statement = await categorizeStatement(
      new File(["statement"], "statement.pdf", { type: "application/pdf" }),
    );

    expect(statement.summary).toMatchObject({
      provider: "BDO",
      accountType: "AMEX",
      totalTransactions: 46,
      totalAmountDue: 56040.04,
      totalExtractedAmount: 113212.94,
    });
    expect(statement.transactions).toHaveLength(46);
    expect(statement.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "FIX ONE AYALA MAKATI MAKATI PH",
          amount: -500,
          isExcluded: false,
        }),
        expect.objectContaining({
          description: "PAYMENT RECEIVED - THANK YOU",
          amount: 169252.98,
          isExcluded: true,
        }),
      ]),
    );
    expect(statement.transactions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringContaining("Reference:"),
        }),
        expect.objectContaining({
          description: expect.stringContaining("3751-880054-18231"),
        }),
      ]),
    );
  });

  it("routes from the first extracted page and transforms the ordered page text", async () => {
    vi.mocked(extractPdfPages).mockResolvedValueOnce([
      { pageNumber: 1, text: "bDo aMeX credit card (pHp)" },
      { pageNumber: 2, text: bdoFixture },
    ]);

    await expect(
      categorizeStatement(
        new File(["statement"], "statement.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toMatchObject({
      summary: { totalTransactions: 46, provider: "BDO", accountType: "AMEX" },
    });
  });

  it("routes EastWest Visa when its provider identifier appears after the first page", async () => {
    await expect(
      categorizePages([
        { pageNumber: 1, text: "VISA credit card (pHp)" },
        { pageNumber: 2, text: eastwestFixture },
      ]),
    ).resolves.toMatchObject({
      summary: {
        totalTransactions: 22,
        provider: "EastWest",
        accountType: "Visa",
      },
    });
  });

  it("rejects a BDO fixture when a card subtotal no longer reconciles", async () => {
    await expect(
      categorizeFixture(
        bdoFixture.replace("SUBTOTAL 5,471.00", "SUBTOTAL 5,470.99"),
      ),
    ).rejects.toThrow(/subtotal/i);
  });

  it("uses the first repeated control occurrence without comparing later copies", async () => {
    let totalAmountDueCount = 0;
    const laterControlChanged = bdoFixture
      .split(/\r?\n/u)
      .map((line) => {
        if (!/^Total Amount Due\s/iu.test(line)) return line;
        totalAmountDueCount += 1;
        return totalAmountDueCount === 2
          ? line.replace("56,040.04", "56,040.03")
          : line;
      })
      .join("\n");

    await expect(categorizeFixture(laterControlChanged)).resolves.toMatchObject(
      {
        summary: { totalAmountDue: 56040.04 },
      },
    );
  });

  it("accepts a BDO Reference after a repeated page header", async () => {
    const pageSplitReference = bdoFixture.replace(
      /(05\/19\/26 05\/20\/26 APPLE\.COM\/BILL HOLLYHILL IE 399\.00)\r?\n(Reference: MX5XGZW3XKA0)/u,
      [
        "$1",
        "Page 2 of 4",
        "MR FOO BAR NAME",
        "Statement of Account",
        "AMEX EXPLORER (PHP)",
        "Statement Date June 18, 2026",
        "Sale Date Post Date Transaction Details Amount",
        "$2",
      ].join("\n"),
    );

    await expect(categorizeFixture(pageSplitReference)).resolves.toMatchObject({
      summary: { totalTransactions: 46 },
    });
  });

  it.each([
    [
      "negative activity control",
      bdoFixture.replace(
        "05/19/26 05/20/26 PAYMENT RECEIVED - THANK YOU -169,252.98",
        "05/19/26 05/20/26 PAYMENT RECEIVED - THANK YOU -169,252.97",
      ),
      /Payments\/Other Credits|negative activity/i,
    ],
    [
      "the Account Summary equation",
      bdoFixture.replace(
        /Finance Charge \(\+\)\r?\n[^\r\n]*0\.00/u,
        "Finance Charge (+)\nâ‚± 1.00",
      ),
      /Account Summary/i,
    ],
    [
      "an invalid calendar date",
      bdoFixture.replace(
        "05/17/26 05/19/26 FIX ONE AYALA MAKATI MAKATI PH 500.00",
        "02/30/26 05/19/26 FIX ONE AYALA MAKATI MAKATI PH 500.00",
      ),
      /calendar date/i,
    ],
    [
      "an orphan Reference line",
      bdoFixture.replace(
        "CARD NUMBER 3751-880054-18231",
        "CARD NUMBER 3751-880054-18231\nReference: orphan",
      ),
      /orphan Reference/i,
    ],
    [
      "an orphan Reference outside card activity",
      bdoFixture.replace(
        "SUBTOTAL 5,471.00",
        "SUBTOTAL 5,471.00\nReference: after section",
      ),
      /orphan Reference/i,
    ],
    [
      "a malformed transaction-prefixed line",
      bdoFixture.replace(
        "05/18/26 05/21/26 LAZADA PH MAKATI PH 1,590.00",
        "05/18/26 malformed transaction row",
      ),
      /malformed transaction/i,
    ],
    [
      "a transaction-prefixed line outside card activity",
      bdoFixture.replace(
        "TOTAL 56,040.04",
        "TOTAL 56,040.04\n06/31/26 malformed transaction row",
      ),
      /transaction row.*outside card activity/i,
    ],
  ])("rejects %s", async (_case, text, error) => {
    await expect(categorizeFixture(text)).rejects.toThrow(error);
  });

  it("rejects a BDO fixture without any extracted Transactions", async () => {
    const withoutTransactions = bdoFixture.replace(
      /^\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{2}\/\d{2}\s+.+$/gmu,
      "",
    );

    await expect(categorizeFixture(withoutTransactions)).rejects.toThrow(
      /Transactions|subtotal/i,
    );
  });

  it("normalizes provider signs and categorizes the complete EastWest Visa fixture", async () => {
    const statement = await categorizeFixture(eastwestFixture);

    expect(statement.summary).toMatchObject({
      provider: "EastWest",
      accountType: "Visa",
      totalTransactions: 22,
      totalAmountDue: 30481.08,
      totalExtractedAmount: 1004.29,
    });
    expect(statement.transactions).toHaveLength(22);
    expect(statement.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionDate: new Date("2026-06-23T00:00:00.000Z"),
          postingDate: new Date("2026-06-24T00:00:00.000Z"),
          description: "PETRON SERVICE STATION TAGUIG PHL",
          amount: -4673.08,
          isExcluded: false,
        }),
        expect.objectContaining({
          description: "QUASI CASH TRANSACTION FEE",
          amount: -300,
          isExcluded: false,
        }),
        expect.objectContaining({
          description: "INTERNET PAYMENT",
          amount: 37155.45,
          isExcluded: true,
        }),
        expect.objectContaining({
          description: "QUASI CASH FEE CASHBACK ADJ",
          amount: 300,
          isExcluded: true,
        }),
        expect.objectContaining({
          transactionDate: new Date("2026-07-12T00:00:00.000Z"),
          description: "BAYAD CENTER MERALCO PASIG PHL",
          amount: -20062.52,
          isExcluded: false,
        }),
      ]),
    );
  });

  it("infers December activity as the prior year for a January Statement Date", async () => {
    const januaryFixture = `EastWest Visa statement in PESO
Statement Date JAN 15 2026
Previous Balance 100.00
Plus: Purchases/Debits 100.00
Cash Advances 0.00
Installment 0.00
Fees/Charges 0.00
Less: Payments 0.00
Credits 0.00
Total Statement Balance 200.00
YOUR CARD ACTIVITIES
BASIC TRANSACTIONS
DEC 31 JAN 02 DECEMBER MERCHANT 100.00
Total Statement Balance 200.00`;

    const statement = await categorizeFixture(januaryFixture);

    expect(statement.transactions).toEqual([
      expect.objectContaining({
        transactionDate: new Date("2025-12-31T00:00:00.000Z"),
        postingDate: new Date("2026-01-02T00:00:00.000Z"),
        description: "DECEMBER MERCHANT",
        amount: -100,
        isExcluded: false,
      }),
    ]);
  });

  it("uses the first repeated Total Statement Balance control", async () => {
    const laterControlChanged = eastwestFixture.replace(
      "Total Statement Balance 30,481.08\n***END OF STATEMENT***",
      "Total Statement Balance 30,481.07\n***END OF STATEMENT***",
    );

    await expect(categorizeFixture(laterControlChanged)).resolves.toMatchObject(
      {
        summary: { totalAmountDue: 30481.08 },
      },
    );
  });

  it.each([
    [
      "a missing control",
      eastwestFixture.replace(/^Credits 300\.00\r?\n/mu, ""),
      /missing Credits control/i,
    ],
    [
      "no Transactions",
      eastwestFixture.replace(
        /^[A-Z]{3}\s+\d{1,2}\s+[A-Z]{3}\s+\d{1,2}\s+.+$/gmu,
        "",
      ),
      /Transactions|activity/i,
    ],
    [
      "an invalid calendar date",
      eastwestFixture.replace(
        "JUN 23 JUN 24 PETRON SERVICE STATION TAGUIG PHL 4,673.08",
        "JUN 31 JUN 24 PETRON SERVICE STATION TAGUIG PHL 4,673.08",
      ),
      /calendar date/i,
    ],
    [
      "an invalid amount",
      eastwestFixture.replace(
        "JUN 23 JUN 24 PETRON SERVICE STATION TAGUIG PHL 4,673.08",
        "JUN 23 JUN 24 PETRON SERVICE STATION TAGUIG PHL 4,673.0",
      ),
      /malformed transaction|invalid amount/i,
    ],
    [
      "a doubly signed control amount",
      eastwestFixture.replace(
        "Previous Balance 31,485.37",
        "Previous Balance --31,485.37",
      ),
      /invalid amount/i,
    ],
    [
      "a malformed transaction-prefixed line",
      eastwestFixture.replace(
        "JUN 23 JUN 24 PETRON SERVICE STATION TAGUIG PHL 4,673.08",
        "JUN 23 JUN 24 malformed transaction row",
      ),
      /malformed transaction/i,
    ],
    [
      "a positive activity reconciliation mismatch",
      eastwestFixture.replace(
        "Plus: Purchases/Debits 36,161.16",
        "Plus: Purchases/Debits 36,161.15",
      ),
      /positive activity/i,
    ],
    [
      "a negative activity reconciliation mismatch",
      eastwestFixture.replace(
        "Less: Payments 37,165.45",
        "Less: Payments 37,165.44",
      ),
      /negative activity/i,
    ],
    [
      "a closing-balance reconciliation mismatch",
      eastwestFixture.replace(
        "Previous Balance 31,485.37",
        "Previous Balance 31,485.36",
      ),
      /closing balance|Total Statement Balance/i,
    ],
  ])("rejects %s", async (_case, text, error) => {
    await expect(categorizeFixture(text)).rejects.toThrow(error);
  });

  it("does not accept the discarded numeric-date EastWest layout", async () => {
    const numericDateFixture = eastwestFixture
      .replace(
        "JUN 23 JUN 24 PETRON SERVICE STATION TAGUIG PHL 4,673.08",
        "06/23 06/24 PETRON SERVICE STATION TAGUIG PHL 4,673.08",
      )
      .replace(
        "Plus: Purchases/Debits 36,161.16",
        "Plus: Purchases/Debits 31,488.08",
      )
      .replace(
        "Total Statement Balance 30,481.08",
        "Total Statement Balance 25,808.00",
      );

    await expect(categorizeFixture(numericDateFixture)).rejects.toThrow(
      /numeric transaction/i,
    );
  });

  it("normalizes the complete GCash E-Wallet fixture through the Statement Import boundary", async () => {
    const statement = await categorizeFixture(gcashFixture);
    const incomingTransactions = statement.transactions.filter(
      (transaction) => transaction.amount > 0,
    );
    const outgoingTransactions = statement.transactions.filter(
      (transaction) => transaction.amount < 0,
    );

    expect(statement.summary).toMatchObject({
      statementDate: new Date("2026-09-07T00:00:00.000Z"),
      provider: "GCash",
      accountType: "E-Wallet",
      totalTransactions: 55,
      totalAmountDue: 26696.92,
      totalExtractedAmount: -25291.92,
    });
    expect(statement.transactions).toHaveLength(55);
    expect(incomingTransactions).toHaveLength(6);
    expect(
      incomingTransactions.reduce(
        (total, transaction) => total + moneyToCents(transaction.amount),
        0,
      ),
    ).toBe(574300);
    expect(outgoingTransactions).toHaveLength(49);
    expect(
      outgoingTransactions.reduce(
        (total, transaction) =>
          total + moneyToCents(Math.abs(transaction.amount)),
        0,
      ),
    ).toBe(3103492);

    expect(
      statement.transactions.every(({ description }) =>
        / \[Ref\. #:\s+\d+\]$/u.test(description),
      ),
    ).toBe(true);
    expect(statement.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionDate: new Date("2026-08-15T00:00:00.000Z"),
          postingDate: new Date("2026-08-15T00:00:00.000Z"),
          description:
            "Received GCash from GrabPay with account ending in 0272 and invno:20260815GPNEPHM2XXXB0000000516038 [Ref. #: 5043976930170]",
          amount: 1020,
          isExcluded: true,
        }),
        expect.objectContaining({
          transactionDate: new Date("2026-08-09T00:00:00.000Z"),
          postingDate: new Date("2026-08-09T00:00:00.000Z"),
          description: "Transfer from 09112334455 to 09676769174 [Ref. #: 5043775892919]",
          amount: -4000,
          isExcluded: false,
        }),
      ]),
    );
    expect(statement.transactions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringMatching(
            /(?:7178\.87|3178\.87|ENDING BALANCE)/u,
          ),
        }),
      ]),
    );
  });

  it.each([
    [
      "an invalid statement range",
      gcashFixture.replace(
        "2026-08-09 to 2026-09-07",
        "2026-09-07 to 2026-08-09",
      ),
    ],
    [
      "an invalid statement date",
      gcashFixture.replace(
        "2026-08-09 to 2026-09-07",
        "2026-02-30 to 2026-09-07",
      ),
    ],
    [
      "an invalid transaction date",
      gcashFixture.replace(
        "2026-08-09 12:20 PM",
        "2026-02-30 12:20 PM",
      ),
    ],
    [
      "an invalid transaction amount",
      gcashFixture.replace(/4000\.00(?=\s+3178\.87)/u, "4000.0"),
    ],
    [
      "a malformed wrapped row",
      gcashFixture.replace(
        /invno:20260815GPNEPHM2XXXB0000000516038\s+5043976930170\s+1020\.00\s+2588\.87/u,
        "invno:20260815GPNEPHM2XXXB0000000516038",
      ),
    ],
    [
      "a missing total",
      gcashFixture.replace(/^Total Credit\s+10081\.00$/mu, ""),
    ],
    [
      "empty activity",
      gcashFixture
        .split(/\r?\n/u)
        .filter(
          (line) =>
            !/^\d{4}-\d{2}-\d{2}\s+/u.test(line.trim()) &&
            !/^invno:/iu.test(line.trim()),
        )
        .join("\n"),
    ],
    [
      "an aggregate mismatch",
      gcashFixture.replace(
        /^Total Credit\s+10081\.00$/mu,
        "Total Credit  10080.99",
      ),
    ],
  ])("rejects %s with a provider-specific validation error", async (_case, text) => {
    await expect(categorizeFixture(text)).rejects.toThrow(
      /GCash E-Wallet statement validation failed/u,
    );
  });
});
