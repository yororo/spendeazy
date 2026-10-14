import { centsToMoney, moneyToCents } from "@/shared/money";

import { cleanDescription } from "../statement-import-utils";
import { StatementTransformationError } from "./statement-transformation-error";
import type {
  Statement,
  StatementTransformer,
  StatementEntry,
} from "./transformer";
import {
  MONEY_AMOUNT_PATTERN_SOURCE,
  createUtcDate,
  hasStatementEvidence,
  parseStatementCents,
} from "./statement-parser-utils";

const GCASH_PROVIDER = "GCash E-Wallet";
const GCASH_TITLE_PATTERN = /^GCash Transaction History$/iu;
const DATE_RANGE_PATTERN =
  /^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/u;
const TIME_PATTERN =
  "(?:0?[1-9]|1[0-2]):[0-5]\\d\\s+[AP]M";
const EXPENSE_PATTERN = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2})\\s+(${TIME_PATTERN})\\s+(.+?)\\s+(\\d+)\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})$`,
  "iu",
);
const EXPENSE_START_PATTERN = new RegExp(
  `^\\d{4}-\\d{2}-\\d{2}\\s+${TIME_PATTERN}\\s+.+$`,
  "iu",
);
const CALENDAR_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}\b/u;
const TABLE_HEADER_PATTERN =
  /^Date and Time\s+Description\s+Reference No\.\s+Debit\s+Credit\s+Balance$/iu;
const CONTROL_LABELS = [
  "STARTING BALANCE",
  "ENDING BALANCE",
  "Total Debit",
  "Total Credit",
] as const;

interface GCashControls {
  readonly startDate: Date;
  readonly statementDate: Date;
  readonly totalDebitCents: number;
  readonly totalCreditCents: number;
}

interface ParsedActivity {
  readonly entries: StatementEntry[];
  readonly totalExtractedCents: number;
  readonly totalExtractedMagnitudeCents: number;
}

function validationError(reason: string): never {
  throw new StatementTransformationError(
    "validation",
    `${GCASH_PROVIDER} statement validation failed: ${reason}`,
    GCASH_PROVIDER,
  );
}

function normalizeLine(line: string) {
  return line.trim().replace(/\s+/gu, " ");
}

function parseCalendarDate(value: string, context: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return validationError(`invalid date for ${context}.`);
  }

  const [yearText, monthText, dayText] = value.split("-");
  const date = createUtcDate(
    Number(yearText),
    Number(monthText),
    Number(dayText),
  );
  if (!date) return validationError(`invalid calendar date for ${context}.`);

  return date;
}

function parseAmount(value: string, context: string): number {
  const cents = parseStatementCents(value);
  if (cents === null || cents < 0) {
    return validationError(`invalid amount for ${context}.`);
  }

  return cents;
}

function findControlLine(
  lines: readonly string[],
  label: (typeof CONTROL_LABELS)[number],
): string {
  const line = lines.find((candidate) => {
    const normalized = normalizeLine(candidate);
    return normalized.toLocaleLowerCase().startsWith(`${label.toLocaleLowerCase()} `);
  });
  if (!line) return validationError(`missing ${label} control.`);

  return normalizeLine(line);
}

function parseControlAmount(
  lines: readonly string[],
  label: (typeof CONTROL_LABELS)[number],
): number {
  const line = findControlLine(lines, label);
  const amountText = line.slice(label.length).trim();
  return parseAmount(amountText, label);
}

function readControls(lines: readonly string[]): GCashControls {
  if (!lines.some((line) => GCASH_TITLE_PATTERN.test(normalizeLine(line)))) {
    return validationError("missing GCash Transaction History heading.");
  }

  const rangeLine = lines.find((line) => DATE_RANGE_PATTERN.test(normalizeLine(line)));
  if (!rangeLine) {
    return validationError("missing or invalid statement date range.");
  }

  const rangeMatch = normalizeLine(rangeLine).match(DATE_RANGE_PATTERN);
  if (!rangeMatch) return validationError("invalid statement date range.");

  const [, startDateText, statementDateText] = rangeMatch;
  const startDate = parseCalendarDate(startDateText, "statement range start");
  const statementDate = parseCalendarDate(
    statementDateText,
    "statement range end",
  );
  if (startDate.getTime() > statementDate.getTime()) {
    return validationError("statement range start is after its end.");
  }

  if (!lines.some((line) => TABLE_HEADER_PATTERN.test(normalizeLine(line)))) {
    return validationError("missing statement entry table header.");
  }

  parseControlAmount(lines, "STARTING BALANCE");
  parseControlAmount(lines, "ENDING BALANCE");

  return {
    startDate,
    statementDate,
    totalDebitCents: parseControlAmount(lines, "Total Debit"),
    totalCreditCents: parseControlAmount(lines, "Total Credit"),
  };
}

function isControlLine(line: string) {
  const normalized = normalizeLine(line);
  return (
    GCASH_TITLE_PATTERN.test(normalized) ||
    DATE_RANGE_PATTERN.test(normalized) ||
    TABLE_HEADER_PATTERN.test(normalized) ||
    CONTROL_LABELS.some((label) =>
      normalized.toLocaleLowerCase().startsWith(`${label.toLocaleLowerCase()} `),
    )
  );
}

function isIncomingDescription(description: string) {
  return /^(?:Refund|Received)\b/iu.test(description);
}

function parseExpense(
  rowLines: readonly string[],
  lineNumber: number,
  controls: GCashControls,
): { expense: StatementEntry; amountMagnitudeCents: number } {
  const row = rowLines.map(normalizeLine).filter(Boolean).join(" ");
  const match = row.match(EXPENSE_PATTERN);
  if (!match) {
    return validationError(`malformed statement entry on line ${lineNumber}.`);
  }

  const [
    ,
    dateText,
    ,
    descriptionText,
    referenceNumber,
    amountText,
    balanceText,
  ] = match;
  const entryDate = parseCalendarDate(
    dateText,
    `statement entry date on line ${lineNumber}`,
  );
  if (
    entryDate.getTime() < controls.startDate.getTime() ||
    entryDate.getTime() > controls.statementDate.getTime()
  ) {
    return validationError(
      `statement entry date on line ${lineNumber} is outside the statement range.`,
    );
  }

  const baseDescription = cleanDescription(descriptionText);
  if (!baseDescription) {
    return validationError(`statement entry on line ${lineNumber} has no description.`);
  }
  const amountMagnitudeCents = parseAmount(
    amountText,
    `statement entry on line ${lineNumber}`,
  );
  parseAmount(balanceText, `running Balance on line ${lineNumber}`);

  const providerAmountCents = isIncomingDescription(baseDescription)
    ? -amountMagnitudeCents
    : amountMagnitudeCents;

  return {
    expense: {
      entryDate,
      postingDate: entryDate,
      description: baseDescription,
      amount: centsToMoney(providerAmountCents),
      reference: referenceNumber,
    },
    amountMagnitudeCents,
  };
}

function parseActivity(
  lines: readonly string[],
  controls: GCashControls,
): ParsedActivity {
  const entries: StatementEntry[] = [];
  let totalExtractedCents = 0;
  let totalExtractedMagnitudeCents = 0;
  let activeRow: { lines: string[]; lineNumber: number } | null = null;

  function flushActiveRow() {
    if (!activeRow) return;

    const parsed = parseExpense(
      activeRow.lines,
      activeRow.lineNumber,
      controls,
    );
    entries.push(parsed.expense);
    totalExtractedCents += moneyToCents(parsed.expense.amount);
    totalExtractedMagnitudeCents += parsed.amountMagnitudeCents;
    activeRow = null;
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const normalizedLine = normalizeLine(line);
    if (!normalizedLine) return;

    if (EXPENSE_START_PATTERN.test(normalizedLine)) {
      flushActiveRow();
      activeRow = { lines: [normalizedLine], lineNumber };
      return;
    }

    if (isControlLine(normalizedLine)) {
      flushActiveRow();
      return;
    }

    if (CALENDAR_DATE_PREFIX_PATTERN.test(normalizedLine)) {
      return validationError(`malformed statement entry on line ${lineNumber}.`);
    }

    if (!activeRow) {
      return validationError(`unexpected statement row on line ${lineNumber}.`);
    }

    activeRow.lines.push(normalizedLine);
  });

  flushActiveRow();

  if (entries.length === 0) {
    return validationError("no Statement Entries were extracted from the activity.");
  }

  const expectedMagnitudeCents =
    controls.totalDebitCents + controls.totalCreditCents;
  if (totalExtractedMagnitudeCents !== expectedMagnitudeCents) {
    return validationError(
      "extracted row amounts do not match Total Debit plus Total Credit.",
    );
  }

  return {
    entries,
    totalExtractedCents,
    totalExtractedMagnitudeCents,
  };
}

const gcashEwalletTransformer: StatementTransformer = {
  provider: GCASH_PROVIDER,
  matches(statementText) {
    return (
      hasStatementEvidence(statementText, "GCash") &&
      /\bGCash\s+Transaction\s+History\b/iu.test(statementText)
    );
  },
  transform(statementText): Statement {
    const lines = statementText.split(/\r?\n/u);
    const controls = readControls(lines);
    const activity = parseActivity(lines, controls);

    return {
      summary: {
        statementType: "e_wallet",
        statementDate: controls.statementDate,
        provider: "GCash",
        accountType: "E-Wallet",
        transactionHistoryStartDate: controls.startDate,
        totalDebit: centsToMoney(controls.totalDebitCents),
        entryCount: activity.entries.length,
        totalAmountDue: centsToMoney(controls.totalDebitCents),
        totalExtractedAmount: centsToMoney(activity.totalExtractedCents),
      },
      entries: activity.entries,
    };
  },
};

export { gcashEwalletTransformer };
