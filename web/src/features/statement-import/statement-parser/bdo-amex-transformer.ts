import { centsToMoney } from "@/shared/money";

import { StatementTransformationError } from "./statement-transformation-error";
import type {
  Statement,
  StatementTransformer,
  Transaction,
} from "./transformer";
import {
  MONEY_AMOUNT_PATTERN_SOURCE,
  createUtcDate,
  extractMoneyToken,
  hasNonPhpStatementCurrencyEvidence,
  hasStatementEvidence,
  parseStatementCents,
} from "./statement-parser-utils";

const BDO_PROVIDER = "BDO AMEX";
const TRANSACTION_PATTERN = new RegExp(
  `^(\\d{2}\\/\\d{2}\\/\\d{2})\\s+(\\d{2}\\/\\d{2}\\/\\d{2})\\s+(.+?)\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})$`,
  "u",
);
const TRANSACTION_PREFIX_PATTERN = /^\d{2}\/\d{2}\/\d{2}(?:\s|$)/u;
const TRANSACTION_HEADER_PATTERN =
  /^Sale Date\s+Post Date\s+Transaction Details\s+Amount$/iu;
const STATEMENT_DATE_PATTERN =
  /^Statement Date\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})$/iu;
const TOTAL_PATTERN = new RegExp(
  `^TOTAL\\s+${MONEY_AMOUNT_PATTERN_SOURCE}$`,
  "iu",
);

const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);

interface BdoControls {
  readonly statementDate: Date;
  readonly totalAmountDueCents: number;
  readonly previousBalanceCents: number;
  readonly purchasesAndAdvancesCents: number;
  readonly financeChargeCents: number;
  readonly feesOtherDebitsCents: number;
  readonly lateChargeCents: number;
  readonly paymentsOtherCreditsCents: number;
}

interface ParsedActivity {
  readonly transactions: Transaction[];
  readonly subtotalsCents: readonly number[];
  readonly finalTotalCents: number | null;
  readonly sectionCount: number;
  readonly previousStatementBalanceCents: number;
  readonly positiveActivityCents: number;
  readonly negativeActivityCents: number;
  readonly totalExtractedCents: number;
}

interface ParsedTransaction {
  readonly transaction: Transaction;
  readonly amountCents: number;
}

function validationError(reason: string): never {
  throw new StatementTransformationError(
    "validation",
    `BDO AMEX statement validation failed: ${reason}`,
    BDO_PROVIDER,
  );
}

function isLabelLine(line: string, label: string) {
  const normalizedLine = line.toLocaleLowerCase();
  const normalizedLabel = label.toLocaleLowerCase();

  return (
    normalizedLine === normalizedLabel ||
    normalizedLine.startsWith(`${normalizedLabel} `)
  );
}

function parseCents(value: string, context: string) {
  const normalizedValue = value.trim();
  const cents = parseStatementCents(normalizedValue);
  if (cents === null) {
    return validationError(`invalid amount for ${context}.`);
  }
  return cents;
}

function extractFirstLabeledCents(
  lines: readonly string[],
  label: string,
): number {
  const index = lines.findIndex((line) => isLabelLine(line, label));
  if (index < 0) {
    return validationError(`missing ${label} control.`);
  }

  const line = lines[index] ?? "";
  const suffix = line.slice(label.length).trim();
  const sameLineToken = extractMoneyToken(suffix);
  if (sameLineToken) {
    return parseCents(sameLineToken, label);
  }

  const nextLineToken = extractMoneyToken(lines[index + 1] ?? "");
  if (!nextLineToken) {
    return validationError(`missing amount for ${label} control.`);
  }

  return parseCents(nextLineToken, label);
}

function parseStatementDate(lines: readonly string[]): Date {
  const index = lines.findIndex((line) => isLabelLine(line, "Statement Date"));
  if (index < 0) {
    return validationError("missing Statement Date control.");
  }

  const line = lines[index] ?? "";
  const match = line.match(STATEMENT_DATE_PATTERN);
  if (!match) {
    return validationError("invalid Statement Date.");
  }

  const [, dateText] = match;
  const dateParts = dateText.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/u);
  if (!dateParts) {
    return validationError("invalid Statement Date.");
  }

  const [, monthName, dayText, yearText] = dateParts;
  const month = MONTHS.get(monthName.toLocaleLowerCase());
  const day = Number(dayText);
  const year = Number(yearText);
  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) {
    return validationError(`invalid Statement Date: ${dateText}.`);
  }

  const statementDate = createUtcDate(year, month, day);
  if (!statementDate) {
    return validationError(
      `invalid calendar date for Statement Date ${dateText}.`,
    );
  }

  return statementDate;
}

function parseTransactionDate(value: string, context: string): Date {
  const parts = value.split("/").map(Number);
  const [month, day, shortYear] = parts;
  if (
    parts.length !== 3 ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(shortYear)
  ) {
    return validationError(`invalid calendar date for ${context}.`);
  }

  const date = createUtcDate(2000 + shortYear, month, day);
  if (!date) return validationError(`invalid calendar date for ${context}.`);

  return date;
}

function parseTransaction(line: string, lineNumber: number): ParsedTransaction {
  const match = line.match(TRANSACTION_PATTERN);
  if (!match) {
    return validationError(`malformed transaction row on line ${lineNumber}.`);
  }

  const [, transactionDateText, postingDateText, description, amountText] =
    match;
  const transactionDate = parseTransactionDate(
    transactionDateText,
    `transaction date on line ${lineNumber}`,
  );
  const postingDate = parseTransactionDate(
    postingDateText,
    `posting date on line ${lineNumber}`,
  );
  const amountCents = parseCents(
    amountText,
    `transaction on line ${lineNumber}`,
  );

  if (!description.trim()) {
    return validationError(
      `transaction on line ${lineNumber} has no description.`,
    );
  }

  return {
    transaction: {
      transactionDate,
      postingDate,
      description: description.trim(),
      amount: centsToMoney(amountCents),
    },
    amountCents,
  };
}

function parseActivity(lines: readonly string[]): ParsedActivity {
  const transactions: Transaction[] = [];
  const subtotalsCents: number[] = [];
  let activeSection: {
    balanceCents: number;
    transactionCount: number;
  } | null = null;
  let previousStatementBalanceCents: number | null = null;
  let pendingOpeningBalanceCents: number | null = null;
  let finalTotalCents: number | null = null;
  let canAcceptReference = false;
  let sectionCount = 0;
  let positiveActivityCents = 0;
  let negativeActivityCents = 0;
  let totalExtractedCents = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    if (/^PREVIOUS STATEMENT BALANCE\b/iu.test(trimmedLine)) {
      if (activeSection || previousStatementBalanceCents !== null) {
        validationError(
          `unexpected PREVIOUS STATEMENT BALANCE on line ${lineNumber}.`,
        );
      }

      const balanceText = extractMoneyToken(
        trimmedLine.slice("PREVIOUS STATEMENT BALANCE".length),
      );
      if (!balanceText) {
        validationError(
          `missing PREVIOUS STATEMENT BALANCE amount on line ${lineNumber}.`,
        );
      }

      previousStatementBalanceCents = parseCents(
        balanceText,
        "PREVIOUS STATEMENT BALANCE",
      );
      pendingOpeningBalanceCents = previousStatementBalanceCents;
      return;
    }

    if (/^CARD NUMBER\b/iu.test(trimmedLine)) {
      if (activeSection) {
        validationError(
          `card activity section on line ${lineNumber} has no subtotal.`,
        );
      }

      activeSection = {
        balanceCents: pendingOpeningBalanceCents ?? 0,
        transactionCount: 0,
      };
      pendingOpeningBalanceCents = null;
      canAcceptReference = false;
      sectionCount += 1;
      return;
    }

    if (/^SUBTOTAL\b/iu.test(trimmedLine)) {
      if (!activeSection) {
        validationError(`orphan SUBTOTAL control on line ${lineNumber}.`);
      }

      const subtotalText = extractMoneyToken(
        trimmedLine.slice("SUBTOTAL".length),
      );
      if (!subtotalText) {
        validationError(`missing SUBTOTAL amount on line ${lineNumber}.`);
      }

      const subtotalCents = parseCents(subtotalText, "SUBTOTAL");
      if (activeSection.transactionCount === 0) {
        validationError(
          `card activity section on line ${lineNumber} has no Transactions.`,
        );
      }
      if (activeSection.balanceCents !== subtotalCents) {
        validationError(
          `card activity subtotal on line ${lineNumber} does not match its opening balance plus positive and negative activity.`,
        );
      }

      subtotalsCents.push(subtotalCents);
      activeSection = null;
      canAcceptReference = false;
      return;
    }

    if (TOTAL_PATTERN.test(trimmedLine)) {
      if (activeSection) {
        validationError(
          `card activity section before line ${lineNumber} has no subtotal.`,
        );
      }

      if (finalTotalCents === null) {
        const totalText = extractMoneyToken(trimmedLine.slice("TOTAL".length));
        if (!totalText) {
          validationError(`missing TOTAL amount on line ${lineNumber}.`);
        }
        finalTotalCents = parseCents(totalText, "TOTAL");
      }
      canAcceptReference = false;
      return;
    }
    if (TRANSACTION_HEADER_PATTERN.test(trimmedLine)) {
      return;
    }

    if (/^Reference:/iu.test(trimmedLine)) {
      if (
        !activeSection ||
        !canAcceptReference ||
        !/^Reference:\s+\S+$/iu.test(trimmedLine)
      ) {
        validationError(`orphan Reference on line ${lineNumber}.`);
      }
      canAcceptReference = false;
      return;
    }

    if (TRANSACTION_PREFIX_PATTERN.test(trimmedLine)) {
      if (!activeSection) {
        validationError(
          `transaction row on line ${lineNumber} is outside card activity.`,
        );
      }

      const parsedTransaction = parseTransaction(trimmedLine, lineNumber);
      transactions.push(parsedTransaction.transaction);
      activeSection.transactionCount += 1;
      activeSection.balanceCents += parsedTransaction.amountCents;
      totalExtractedCents += parsedTransaction.amountCents;
      if (parsedTransaction.amountCents > 0) {
        positiveActivityCents += parsedTransaction.amountCents;
      } else {
        negativeActivityCents -= parsedTransaction.amountCents;
      }
      canAcceptReference = true;
      return;
    }

    if (!activeSection) return;
  });

  if (activeSection) {
    validationError("the final card activity section has no SUBTOTAL control.");
  }
  if (sectionCount === 0) {
    validationError("no card activity sections were found.");
  }
  if (previousStatementBalanceCents === null) {
    validationError("missing PREVIOUS STATEMENT BALANCE control.");
  }
  if (subtotalsCents.length !== sectionCount) {
    validationError(
      "each card activity section must have one SUBTOTAL control.",
    );
  }
  if (finalTotalCents === null) {
    validationError("missing TOTAL control.");
  }

  return {
    transactions,
    subtotalsCents,
    finalTotalCents,
    sectionCount,
    previousStatementBalanceCents,
    positiveActivityCents,
    negativeActivityCents,
    totalExtractedCents,
  };
}

function readControls(lines: readonly string[]): BdoControls {
  return {
    statementDate: parseStatementDate(lines),
    totalAmountDueCents: extractFirstLabeledCents(lines, "Total Amount Due"),
    previousBalanceCents: extractFirstLabeledCents(lines, "Previous Balance"),
    purchasesAndAdvancesCents: extractFirstLabeledCents(
      lines,
      "Purchases and Advances (+)",
    ),
    financeChargeCents: extractFirstLabeledCents(lines, "Finance Charge (+)"),
    feesOtherDebitsCents: extractFirstLabeledCents(
      lines,
      "Fees/Other Debits (+)",
    ),
    lateChargeCents: extractFirstLabeledCents(lines, "Late Charge (+)"),
    paymentsOtherCreditsCents: extractFirstLabeledCents(
      lines,
      "Payments/Other Credits (-)",
    ),
  };
}

function validateActivity(controls: BdoControls, activity: ParsedActivity) {
  if (activity.transactions.length === 0) {
    validationError(
      "no Transactions were extracted from the card activity sections.",
    );
  }

  const equationTotalCents =
    controls.previousBalanceCents +
    controls.purchasesAndAdvancesCents +
    controls.financeChargeCents +
    controls.feesOtherDebitsCents +
    controls.lateChargeCents -
    controls.paymentsOtherCreditsCents;
  if (equationTotalCents !== controls.totalAmountDueCents) {
    validationError("the Account Summary does not equal Total Amount Due.");
  }

  if (activity.previousStatementBalanceCents !== controls.previousBalanceCents) {
    validationError(
      "PREVIOUS STATEMENT BALANCE does not match Previous Balance.",
    );
  }

  const expectedPositiveActivityCents =
    controls.purchasesAndAdvancesCents +
    controls.financeChargeCents +
    controls.feesOtherDebitsCents +
    controls.lateChargeCents;
  if (activity.positiveActivityCents !== expectedPositiveActivityCents) {
    validationError(
      "positive activity does not match Purchases and Advances plus charges and fees.",
    );
  }
  if (activity.negativeActivityCents !== controls.paymentsOtherCreditsCents) {
    validationError("negative activity does not match Payments/Other Credits.");
  }

  const subtotalTotalCents = activity.subtotalsCents.reduce(
    (total, subtotal) => total + subtotal,
    0,
  );
  if (subtotalTotalCents !== activity.finalTotalCents) {
    validationError("card subtotals do not match the final TOTAL.");
  }
  if (activity.finalTotalCents !== controls.totalAmountDueCents) {
    validationError("the final TOTAL does not match Total Amount Due.");
  }
}

const bdoAmexTransformer: StatementTransformer = {
  provider: BDO_PROVIDER,
  matches(firstPageText) {
    return (
      hasStatementEvidence(firstPageText, "BDO") &&
      hasStatementEvidence(firstPageText, "AMEX") &&
      hasStatementEvidence(firstPageText, "PHP") &&
      !hasNonPhpStatementCurrencyEvidence(firstPageText)
    );
  },
  transform(statementText): Statement {
    const lines = statementText.split(/\r?\n/u);
    const controls = readControls(lines);
    const activity = parseActivity(lines);
    validateActivity(controls, activity);

    return {
      summary: {
        statementDate: controls.statementDate,
        provider: "BDO",
        accountType: "AMEX",
        totalTransactions: activity.transactions.length,
        totalAmountDue: centsToMoney(controls.totalAmountDueCents),
        totalExtractedAmount: centsToMoney(activity.totalExtractedCents),
      },
      transactions: activity.transactions,
    };
  },
};

export { bdoAmexTransformer };
