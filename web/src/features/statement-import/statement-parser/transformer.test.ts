import { describe, expect, it, vi } from "vitest";

import bdoFixture from "../../../../docs/pdf-parser/bdo-amex-sample-extracted-text.txt?raw";
import eastwestFixture from "../../../../docs/pdf-parser/eastwest-sample-extracted-text.txt?raw";
import gcashFixture from "../../../../docs/pdf-parser/gcash-sample-extracted-text.txt?raw";

import { bdoAmexTransformer } from "./bdo-amex-transformer";
import { eastwestVisaTransformer } from "./eastwest-visa-transformer";
import { gcashEwalletTransformer } from "./gcash-ewallet-transformer";
import {
  selectStatementTransformer,
  StatementTransformationError,
  transformStatement,
  type Statement,
  type StatementTransformer,
} from "./transformer";

const transformedStatement: Statement = {
  summary: {
    statementDate: new Date("2026-06-18T00:00:00.000Z"),
    provider: "Test Provider",
    accountType: "Test Account",
    totalTransactions: 1,
    totalAmountDue: 1,
    totalExtractedAmount: 1,
  },
  transactions: [],
};

function createTransformer(matches: boolean): StatementTransformer {
  return {
    provider: "Test Provider",
    matches: vi.fn(() => matches),
    transform: vi.fn(() => transformedStatement),
  };
}

describe("statement transformer router", () => {
  it("selects from and transforms the complete statement text", () => {
    const transformer = createTransformer(true);
    const statementText = "complete statement text";

    expect(transformStatement(statementText, [transformer])).toBe(
      transformedStatement,
    );
    expect(transformer.matches).toHaveBeenCalledWith(statementText);
    expect(transformer.transform).toHaveBeenCalledWith(statementText);
  });

  it("fails without a matching provider instead of choosing a default", () => {
    const transformer = createTransformer(false);

    expect(() =>
      selectStatementTransformer("unknown", [transformer]),
    ).toThrowError(
      expect.objectContaining<Partial<StatementTransformationError>>({
        code: "unsupported",
      }),
    );
  });

  it("fails when more than one provider matches", () => {
    const firstTransformer = createTransformer(true);
    const secondTransformer = createTransformer(true);

    expect(() =>
      selectStatementTransformer("ambiguous", [
        firstTransformer,
        secondTransformer,
      ]),
    ).toThrowError(
      expect.objectContaining<Partial<StatementTransformationError>>({
        code: "ambiguous",
      }),
    );
  });
});

describe("BDO AMEX recognition", () => {
  it("matches BDO, AMEX, and PHP evidence case-insensitively", () => {
    expect(bdoAmexTransformer.matches("bDo credit card aMeX (pHp)")).toBe(true);
  });

  it.each([
    ["a missing bank marker", "AMEX credit card (PHP)"],
    ["a missing card marker", "BDO credit card (PHP)"],
    ["a missing PHP marker", "BDO AMEX credit card (USD)"],
    ["dual-currency evidence", "BDO AMEX dual-currency card in PHP and USD"],
  ])("does not match %s", (_case, firstPageText) => {
    expect(bdoAmexTransformer.matches(firstPageText)).toBe(false);
  });

  it("recognizes the checked-in BDO fixture from its first page", () => {
    const firstPageText = bdoFixture.slice(
      0,
      bdoFixture.indexOf("Page 1 of 4"),
    );

    expect(bdoAmexTransformer.matches(firstPageText)).toBe(true);
  });
});

describe("BDO AMEX transformation", () => {
  it("reconciles a card subtotal as its closing balance", () => {
    const statementText = `Statement of Account
BDO AMEX (PHP)
Statement Date July 19, 2026
Total Amount Due ₱ 150.00
Previous Balance ₱ 100.00
Purchases and Advances (+) ₱ 70.00
Finance Charge (+) ₱ 0.00
Fees/Other Debits (+) ₱ 0.00
Late Charge (+) ₱ 0.00
Payments/Other Credits (-) ₱ 20.00
Sale Date Post Date Transaction Details Amount
PREVIOUS STATEMENT BALANCE 100.00
CARD NUMBER 1111-222233-33444
07/01/26 07/02/26 PURCHASE MAKATI PH 70.00
07/03/26 07/04/26 PAYMENT RECEIVED -20.00
SUBTOTAL 150.00
TOTAL 150.00`;

    expect(bdoAmexTransformer.transform(statementText).summary).toMatchObject({
      totalAmountDue: 150,
      totalTransactions: 2,
      totalExtractedAmount: 50,
    });
  });
});

describe("EastWest Visa recognition", () => {
  it("matches EastWest, Visa, and PHP evidence case-insensitively", () => {
    expect(
      eastwestVisaTransformer.matches("eAsTwEsT credit card vIsA (pHp)"),
    ).toBe(true);
  });

  it.each([
    ["a missing bank marker", "Visa credit card (PHP)"],
    ["a missing card marker", "EastWest credit card (PHP)"],
    ["a missing PHP marker", "EastWest Visa credit card (USD)"],
    [
      "dual-currency evidence",
      "EastWest Visa dual-currency card in PESO and USD",
    ],
  ])("does not match %s", (_case, firstPageText) => {
    expect(eastwestVisaTransformer.matches(firstPageText)).toBe(false);
  });

  it("recognizes the checked-in EastWest fixture when its first page has PHP evidence", () => {
    expect(eastwestVisaTransformer.matches(eastwestFixture)).toBe(true);
  });
});

describe("GCash E-Wallet recognition", () => {
  it("selects the GCash Transaction History fixture without overlapping card providers", () => {
    expect(selectStatementTransformer(gcashFixture)).toBe(
      gcashEwalletTransformer,
    );
    expect(bdoAmexTransformer.matches(gcashFixture)).toBe(false);
    expect(eastwestVisaTransformer.matches(gcashFixture)).toBe(false);
  });
});
