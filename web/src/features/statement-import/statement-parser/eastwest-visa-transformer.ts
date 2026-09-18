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
  hasNonPhpStatementCurrencyEvidence,
  hasStatementEvidence,
  parseStatementCents,
} from "./statement-parser-utils";

const EASTWEST_PROVIDER = "EastWest Visa";
const TRANSACTION_PATTERN = new RegExp(
  `^([A-Za-z]{3})\\s+(\\d{1,2})\\s+([A-Za-z]{3})\\s+(\\d{1,2})\\s+(.+?)\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})$`,
  "iu",
);
const TRANSACTION_PREFIX_PATTERN =
  /^[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{1,2}(?:\s|$)/iu;
const NUMERIC_TRANSACTION_PREFIX_PATTERN =
  /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s|$)/u;
const STATEMENT_DATE_PATTERN =
  /^Statement Date\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/iu;

const MONTHS = new Map<string, number>([
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["may", 5],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sep", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
]);

interface EastWestControls {
  readonly statementDate: Date;
  readonly previousBalanceCents: number;
  readonly purchasesAndDebitsCents: number;
  readonly cashAdvancesCents: number;
  readonly installmentCents: number;
  readonly feesAndChargesCents: number;
  readonly paymentsCents: number;
  readonly creditsCents: number;
  readonly totalStatementBalanceCents: number;
}

interface ParsedActivity {
  readonly transactions: Transaction[];
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
    `EastWest Visa statement validation failed: ${reason}`,
    EASTWEST_PROVIDER,
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

function parseStatementDate(lines: readonly string[]): Date {
  const index = lines.findIndex((line) =>
    /^Statement Date\b/iu.test(line.trim()),
  );
  if (index < 0) {
    return validationError("missing Statement Date control.");
  }

  const line = lines[index]?.trim() ?? "";
  const match = line.match(STATEMENT_DATE_PATTERN);
  if (!match) {
    return validationError("invalid Statement Date.");
  }

  const [, monthText, dayText, yearText] = match;
  const month = MONTHS.get(monthText.toLocaleLowerCase());
  const day = Number(dayText);
  const year = Number(yearText);
  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) {
    return validationError(`invalid Statement Date: ${line}.`);
  }

  const statementDate = createUtcDate(year, month, day);
  if (!statementDate) {
    return validationError(`invalid calendar date for Statement Date ${line}.`);
  }

  return statementDate;
}

function extractFirstLabeledCents(
  lines: readonly string[],
  label: string,
): number {
  const index = lines.findIndex((line) => {
    const normalizedLine = line.trim().toLocaleLowerCase();
    const normalizedLabel = label.toLocaleLowerCase();
    return normalizedLine.startsWith(`${normalizedLabel} `);
  });
  if (index < 0) {
    return validationError(`missing ${label} control.`);
  }

  const line = lines[index]?.trim() ?? "";
  const amountText = line.slice(label.length).trim();
  if (!amountText) {
    return validationError(`missing amount for ${label} control.`);
  }

  return parseCents(amountText, label);
}

function inferTransactionDate(
  monthText: string,
  dayText: string,
  statementDate: Date,
  context: string,
): Date {
  const month = MONTHS.get(monthText.toLocaleLowerCase());
  const day = Number(dayText);
  if (!month || !Number.isInteger(day)) {
    return validationError(`invalid calendar date for ${context}.`);
  }

  const statementYear = statementDate.getUTCFullYear();
  for (let year = statementYear; year >= statementYear - 400; year -= 1) {
    const candidate = createUtcDate(year, month, day);
    if (candidate && candidate.getTime() <= statementDate.getTime()) {
      return candidate;
    }
  }

  return validationError(`invalid calendar date for ${context}.`);
}

function parseTransaction(
  line: string,
  lineNumber: number,
  statementDate: Date,
): ParsedTransaction {
  const match = line.match(TRANSACTION_PATTERN);
  if (!match) {
    return validationError(`malformed transaction row on line ${lineNumber}.`);
  }

  const [, saleMonth, saleDay, postingMonth, postingDay, description, amountText] =
    match;
  const transactionDate = inferTransactionDate(
    saleMonth,
    saleDay,
    statementDate,
    `transaction date on line ${lineNumber}`,
  );
  const postingDate = inferTransactionDate(
    postingMonth,
    postingDay,
    statementDate,
    `posting date on line ${lineNumber}`,
  );
  const amountCents = parseCents(
    amountText,
    `transaction on line ${lineNumber}`,
  );

  if (!description.trim()) {
    return validationError(`transaction on line ${lineNumber} has no description.`);
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

function parseActivity(
  lines: readonly string[],
  statementDate: Date,
): ParsedActivity {
  const transactions: Transaction[] = [];
  let activitySectionCount = 0;
  let activityStarted = false;
  let positiveActivityCents = 0;
  let negativeActivityCents = 0;
  let totalExtractedCents = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    if (/^YOUR CARD ACTIVITIES$/iu.test(trimmedLine)) {
      activityStarted = true;
      activitySectionCount += 1;
      return;
    }

    if (!activityStarted) return;
    if (NUMERIC_TRANSACTION_PREFIX_PATTERN.test(trimmedLine)) {
      validationError(`unsupported numeric transaction row on line ${lineNumber}.`);
    }
    if (!TRANSACTION_PREFIX_PATTERN.test(trimmedLine)) return;

    const parsedTransaction = parseTransaction(
      trimmedLine,
      lineNumber,
      statementDate,
    );
    transactions.push(parsedTransaction.transaction);
    totalExtractedCents += parsedTransaction.amountCents;
    if (parsedTransaction.amountCents > 0) {
      positiveActivityCents += parsedTransaction.amountCents;
    } else {
      negativeActivityCents -= parsedTransaction.amountCents;
    }
  });

  if (activitySectionCount === 0) {
    validationError("no card activity sections were found.");
  }
  if (transactions.length === 0) {
    validationError("no Transactions were extracted from the card activity sections.");
  }

  return {
    transactions,
    positiveActivityCents,
    negativeActivityCents,
    totalExtractedCents,
  };
}

function readControls(lines: readonly string[]): EastWestControls {
  return {
    statementDate: parseStatementDate(lines),
    previousBalanceCents: extractFirstLabeledCents(lines, "Previous Balance"),
    purchasesAndDebitsCents: extractFirstLabeledCents(
      lines,
      "Plus: Purchases/Debits",
    ),
    cashAdvancesCents: extractFirstLabeledCents(lines, "Cash Advances"),
    installmentCents: extractFirstLabeledCents(lines, "Installment"),
    feesAndChargesCents: extractFirstLabeledCents(lines, "Fees/Charges"),
    paymentsCents: extractFirstLabeledCents(lines, "Less: Payments"),
    creditsCents: extractFirstLabeledCents(lines, "Credits"),
    totalStatementBalanceCents: extractFirstLabeledCents(
      lines,
      "Total Statement Balance",
    ),
  };
}

function validateActivity(
  controls: EastWestControls,
  activity: ParsedActivity,
) {
  const expectedPositiveActivityCents =
    controls.purchasesAndDebitsCents +
    controls.cashAdvancesCents +
    controls.installmentCents +
    controls.feesAndChargesCents;
  if (activity.positiveActivityCents !== expectedPositiveActivityCents) {
    validationError(
      "positive activity does not match Purchases/Debits plus Cash Advances, Installment, and Fees/Charges.",
    );
  }

  const expectedNegativeActivityCents =
    controls.paymentsCents + controls.creditsCents;
  if (activity.negativeActivityCents !== expectedNegativeActivityCents) {
    validationError("negative activity does not match Payments plus Credits.");
  }

  if (
    controls.previousBalanceCents + activity.totalExtractedCents !==
    controls.totalStatementBalanceCents
  ) {
    validationError(
      "Previous Balance plus net activity does not match Total Statement Balance.",
    );
  }
}

const eastwestVisaTransformer: StatementTransformer = {
  provider: EASTWEST_PROVIDER,
  matches(firstPageText) {
    return (
      hasStatementEvidence(firstPageText, "EastWest") &&
      hasStatementEvidence(firstPageText, "Visa") &&
      /\b(?:PESO|PHP)\b/iu.test(firstPageText) &&
      !hasNonPhpStatementCurrencyEvidence(firstPageText)
    );
  },
  transform(statementText): Statement {
    const lines = statementText.split(/\r?\n/u);
    const controls = readControls(lines);
    const activity = parseActivity(lines, controls.statementDate);
    validateActivity(controls, activity);

    return {
      summary: {
        statementDate: controls.statementDate,
        provider: "EastWest",
        accountType: "Visa",
        totalTransactions: activity.transactions.length,
        totalAmountDue: centsToMoney(controls.totalStatementBalanceCents),
        totalExtractedAmount: centsToMoney(activity.totalExtractedCents),
      },
      transactions: activity.transactions,
    };
  },
};

export { eastwestVisaTransformer };
