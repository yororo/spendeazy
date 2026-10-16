/* Generated from web/src statement parsers. Do not edit. */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../web/src/features/statement-import/statement-parser/transformer.ts
var transformer_exports = {};
__export(transformer_exports, {
  StatementTransformationError: () => StatementTransformationError,
  selectStatementTransformer: () => selectStatementTransformer,
  supportedStatementTransformers: () => supportedStatementTransformers,
  transformStatement: () => transformStatement
});
module.exports = __toCommonJS(transformer_exports);

// ../web/src/shared/money/index.ts
var currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP"
});
function moneyToCents(amount) {
  return Math.round(amount * 100);
}
function centsToMoney(amount) {
  return amount / 100;
}

// ../web/src/features/statement-import/statement-parser/statement-transformation-error.ts
var StatementTransformationError = class extends Error {
  code;
  provider;
  constructor(code, message, provider = null) {
    super(message);
    this.name = "StatementTransformationError";
    this.code = code;
    this.provider = provider;
  }
};

// ../web/src/features/statement-import/statement-parser/statement-parser-utils.ts
var UNSIGNED_MONEY_AMOUNT_PATTERN_SOURCE = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}";
var MONEY_AMOUNT_PATTERN_SOURCE = `-?${UNSIGNED_MONEY_AMOUNT_PATTERN_SOURCE}`;
var MONEY_AMOUNT_PATTERN = new RegExp(
  `^${MONEY_AMOUNT_PATTERN_SOURCE}$`,
  "u"
);
function hasStatementEvidence(statementText, evidence) {
  return new RegExp(`\\b${evidence}\\b`, "iu").test(statementText);
}
function hasNonPhpStatementCurrencyEvidence(statementText) {
  return statementText.split(/\r?\n/u).some(
    (line) => /\b(?:BDO|AMEX|EastWest|Visa)\b[^\r\n]*\bdual[- ]currency\b/iu.test(
      line
    ) || /\bdual[- ]currency\b[^\r\n]*\b(?:BDO|AMEX|EastWest|Visa)\b/iu.test(
      line
    ) || /\bstatement\b[^\r\n]*(?:\bUSD\b|\bEUR\b|\bUS dollars?\b)/iu.test(
      line
    ) || /^(?:SALE POST )?CURRENCY\s+(?:USD|EUR)\b/iu.test(line.trim()) || /\((?:USD|EUR)\)/iu.test(line)
  );
}
function parseStatementCents(value) {
  const normalizedValue = value.trim();
  if (!MONEY_AMOUNT_PATTERN.test(normalizedValue)) return null;
  const isNegative = normalizedValue.startsWith("-");
  const unsignedValue = isNegative ? normalizedValue.slice(1) : normalizedValue;
  const [integerPart, fractionalPart] = unsignedValue.replace(/,/gu, "").split(".");
  const cents = Number(integerPart) * 100 + Number(fractionalPart);
  if (!Number.isSafeInteger(cents)) return null;
  return cents === 0 ? 0 : isNegative ? -cents : cents;
}
function extractMoneyToken(value) {
  const match = value.trim().match(
    new RegExp(`(${MONEY_AMOUNT_PATTERN_SOURCE})$`, "u")
  );
  if (!match) return null;
  const prefix = value.trim().slice(0, -match[1].length);
  if (/\d/u.test(prefix)) return null;
  return match[1];
}
function createUtcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

// ../web/src/features/statement-import/statement-parser/bdo-amex-transformer.ts
var BDO_PROVIDER = "BDO AMEX";
var TRANSACTION_PATTERN = new RegExp(
  `^(\\d{2}\\/\\d{2}\\/\\d{2})\\s+(\\d{2}\\/\\d{2}\\/\\d{2})\\s+(.+?)\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})$`,
  "u"
);
var TRANSACTION_PREFIX_PATTERN = /^\d{2}\/\d{2}\/\d{2}(?:\s|$)/u;
var TRANSACTION_HEADER_PATTERN = /^Sale Date\s+Post Date\s+Transaction Details\s+Amount$/iu;
var STATEMENT_DATE_PATTERN = /^Statement Date\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})$/iu;
var TOTAL_PATTERN = new RegExp(
  `^TOTAL\\s+${MONEY_AMOUNT_PATTERN_SOURCE}$`,
  "iu"
);
var MONTHS = new Map(
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
    "december"
  ].map((month, index) => [month, index + 1])
);
function validationError(reason) {
  throw new StatementTransformationError(
    "validation",
    `BDO AMEX statement validation failed: ${reason}`,
    BDO_PROVIDER
  );
}
function isLabelLine(line, label) {
  const normalizedLine = line.toLocaleLowerCase();
  const normalizedLabel = label.toLocaleLowerCase();
  return normalizedLine === normalizedLabel || normalizedLine.startsWith(`${normalizedLabel} `);
}
function parseCents(value, context) {
  const normalizedValue = value.trim();
  const cents = parseStatementCents(normalizedValue);
  if (cents === null) {
    return validationError(`invalid amount for ${context}.`);
  }
  return cents;
}
function extractFirstLabeledCents(lines, label) {
  const index = lines.findIndex((line2) => isLabelLine(line2, label));
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
function parseStatementDate(lines) {
  const index = lines.findIndex((line2) => isLabelLine(line2, "Statement Date"));
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
      `invalid calendar date for Statement Date ${dateText}.`
    );
  }
  return statementDate;
}
function parseTransactionDate(value, context) {
  const parts = value.split("/").map(Number);
  const [month, day, shortYear] = parts;
  if (parts.length !== 3 || !Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(shortYear)) {
    return validationError(`invalid calendar date for ${context}.`);
  }
  const date = createUtcDate(2e3 + shortYear, month, day);
  if (!date) return validationError(`invalid calendar date for ${context}.`);
  return date;
}
function parseTransaction(line, lineNumber) {
  const match = line.match(TRANSACTION_PATTERN);
  if (!match) {
    return validationError(`malformed transaction row on line ${lineNumber}.`);
  }
  const [, transactionDateText, postingDateText, description, amountText] = match;
  const transactionDate = parseTransactionDate(
    transactionDateText,
    `transaction date on line ${lineNumber}`
  );
  const postingDate = parseTransactionDate(
    postingDateText,
    `posting date on line ${lineNumber}`
  );
  const amountCents = parseCents(
    amountText,
    `transaction on line ${lineNumber}`
  );
  if (!description.trim()) {
    return validationError(
      `transaction on line ${lineNumber} has no description.`
    );
  }
  return {
    transaction: {
      transactionDate,
      postingDate,
      description: description.trim(),
      amount: centsToMoney(amountCents)
    },
    amountCents
  };
}
function parseActivity(lines) {
  const transactions = [];
  const subtotalsCents = [];
  let activeSection = null;
  let previousStatementBalanceCents = null;
  let pendingOpeningBalanceCents = null;
  let finalTotalCents = null;
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
          `unexpected PREVIOUS STATEMENT BALANCE on line ${lineNumber}.`
        );
      }
      const balanceText = extractMoneyToken(
        trimmedLine.slice("PREVIOUS STATEMENT BALANCE".length)
      );
      if (!balanceText) {
        validationError(
          `missing PREVIOUS STATEMENT BALANCE amount on line ${lineNumber}.`
        );
      }
      previousStatementBalanceCents = parseCents(
        balanceText,
        "PREVIOUS STATEMENT BALANCE"
      );
      pendingOpeningBalanceCents = previousStatementBalanceCents;
      return;
    }
    if (/^CARD NUMBER\b/iu.test(trimmedLine)) {
      if (activeSection) {
        validationError(
          `card activity section on line ${lineNumber} has no subtotal.`
        );
      }
      activeSection = {
        balanceCents: pendingOpeningBalanceCents ?? 0,
        transactionCount: 0
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
        trimmedLine.slice("SUBTOTAL".length)
      );
      if (!subtotalText) {
        validationError(`missing SUBTOTAL amount on line ${lineNumber}.`);
      }
      const subtotalCents = parseCents(subtotalText, "SUBTOTAL");
      if (activeSection.transactionCount === 0) {
        validationError(
          `card activity section on line ${lineNumber} has no Transactions.`
        );
      }
      if (activeSection.balanceCents !== subtotalCents) {
        validationError(
          `card activity subtotal on line ${lineNumber} does not match its opening balance plus positive and negative activity.`
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
          `card activity section before line ${lineNumber} has no subtotal.`
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
      if (!activeSection || !canAcceptReference || !/^Reference:\s+\S+$/iu.test(trimmedLine)) {
        validationError(`orphan Reference on line ${lineNumber}.`);
      }
      canAcceptReference = false;
      return;
    }
    if (TRANSACTION_PREFIX_PATTERN.test(trimmedLine)) {
      if (!activeSection) {
        validationError(
          `transaction row on line ${lineNumber} is outside card activity.`
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
      "each card activity section must have one SUBTOTAL control."
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
    totalExtractedCents
  };
}
function readControls(lines) {
  return {
    statementDate: parseStatementDate(lines),
    totalAmountDueCents: extractFirstLabeledCents(lines, "Total Amount Due"),
    previousBalanceCents: extractFirstLabeledCents(lines, "Previous Balance"),
    purchasesAndAdvancesCents: extractFirstLabeledCents(
      lines,
      "Purchases and Advances (+)"
    ),
    financeChargeCents: extractFirstLabeledCents(lines, "Finance Charge (+)"),
    feesOtherDebitsCents: extractFirstLabeledCents(
      lines,
      "Fees/Other Debits (+)"
    ),
    lateChargeCents: extractFirstLabeledCents(lines, "Late Charge (+)"),
    paymentsOtherCreditsCents: extractFirstLabeledCents(
      lines,
      "Payments/Other Credits (-)"
    )
  };
}
function validateActivity(controls, activity) {
  if (activity.transactions.length === 0) {
    validationError(
      "no Transactions were extracted from the card activity sections."
    );
  }
  const equationTotalCents = controls.previousBalanceCents + controls.purchasesAndAdvancesCents + controls.financeChargeCents + controls.feesOtherDebitsCents + controls.lateChargeCents - controls.paymentsOtherCreditsCents;
  if (equationTotalCents !== controls.totalAmountDueCents) {
    validationError("the Account Summary does not equal Total Amount Due.");
  }
  if (activity.previousStatementBalanceCents !== controls.previousBalanceCents) {
    validationError(
      "PREVIOUS STATEMENT BALANCE does not match Previous Balance."
    );
  }
  const expectedPositiveActivityCents = controls.purchasesAndAdvancesCents + controls.financeChargeCents + controls.feesOtherDebitsCents + controls.lateChargeCents;
  if (activity.positiveActivityCents !== expectedPositiveActivityCents) {
    validationError(
      "positive activity does not match Purchases and Advances plus charges and fees."
    );
  }
  if (activity.negativeActivityCents !== controls.paymentsOtherCreditsCents) {
    validationError("negative activity does not match Payments/Other Credits.");
  }
  const subtotalTotalCents = activity.subtotalsCents.reduce(
    (total, subtotal) => total + subtotal,
    0
  );
  if (subtotalTotalCents !== activity.finalTotalCents) {
    validationError("card subtotals do not match the final TOTAL.");
  }
  if (activity.finalTotalCents !== controls.totalAmountDueCents) {
    validationError("the final TOTAL does not match Total Amount Due.");
  }
}
var bdoAmexTransformer = {
  provider: BDO_PROVIDER,
  matches(firstPageText) {
    return hasStatementEvidence(firstPageText, "BDO") && hasStatementEvidence(firstPageText, "AMEX") && hasStatementEvidence(firstPageText, "PHP") && !hasNonPhpStatementCurrencyEvidence(firstPageText);
  },
  transform(statementText) {
    const lines = statementText.split(/\r?\n/u);
    const controls = readControls(lines);
    const activity = parseActivity(lines);
    validateActivity(controls, activity);
    return {
      summary: {
        statementType: "credit_card",
        statementDate: controls.statementDate,
        provider: "BDO",
        accountType: "AMEX",
        transactionHistoryStartDate: null,
        totalDebit: null,
        totalTransactions: activity.transactions.length,
        totalAmountDue: centsToMoney(controls.totalAmountDueCents),
        totalExtractedAmount: centsToMoney(activity.totalExtractedCents)
      },
      transactions: activity.transactions
    };
  }
};

// ../web/src/features/statement-import/statement-parser/eastwest-visa-transformer.ts
var EASTWEST_PROVIDER = "EastWest Visa";
var TRANSACTION_PATTERN2 = new RegExp(
  `^([A-Za-z]{3})\\s+(\\d{1,2})\\s+([A-Za-z]{3})\\s+(\\d{1,2})\\s+(.+?)\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})$`,
  "iu"
);
var TRANSACTION_PREFIX_PATTERN2 = /^[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{1,2}(?:\s|$)/iu;
var NUMERIC_TRANSACTION_PREFIX_PATTERN = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s|$)/u;
var STATEMENT_DATE_PATTERN2 = /^Statement Date\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/iu;
var MONTHS2 = /* @__PURE__ */ new Map([
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
  ["dec", 12]
]);
function validationError2(reason) {
  throw new StatementTransformationError(
    "validation",
    `EastWest Visa statement validation failed: ${reason}`,
    EASTWEST_PROVIDER
  );
}
function parseCents2(value, context) {
  const normalizedValue = value.trim();
  const cents = parseStatementCents(normalizedValue);
  if (cents === null) {
    return validationError2(`invalid amount for ${context}.`);
  }
  return cents;
}
function parseStatementDate2(lines) {
  const index = lines.findIndex(
    (line2) => /^Statement Date\b/iu.test(line2.trim())
  );
  if (index < 0) {
    return validationError2("missing Statement Date control.");
  }
  const line = lines[index]?.trim() ?? "";
  const match = line.match(STATEMENT_DATE_PATTERN2);
  if (!match) {
    return validationError2("invalid Statement Date.");
  }
  const [, monthText, dayText, yearText] = match;
  const month = MONTHS2.get(monthText.toLocaleLowerCase());
  const day = Number(dayText);
  const year = Number(yearText);
  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) {
    return validationError2(`invalid Statement Date: ${line}.`);
  }
  const statementDate = createUtcDate(year, month, day);
  if (!statementDate) {
    return validationError2(`invalid calendar date for Statement Date ${line}.`);
  }
  return statementDate;
}
function extractFirstLabeledCents2(lines, label) {
  const index = lines.findIndex((line2) => {
    const normalizedLine = line2.trim().toLocaleLowerCase();
    const normalizedLabel = label.toLocaleLowerCase();
    return normalizedLine.startsWith(`${normalizedLabel} `);
  });
  if (index < 0) {
    return validationError2(`missing ${label} control.`);
  }
  const line = lines[index]?.trim() ?? "";
  const amountText = line.slice(label.length).trim();
  if (!amountText) {
    return validationError2(`missing amount for ${label} control.`);
  }
  return parseCents2(amountText, label);
}
function inferTransactionDate(monthText, dayText, statementDate, context) {
  const month = MONTHS2.get(monthText.toLocaleLowerCase());
  const day = Number(dayText);
  if (!month || !Number.isInteger(day)) {
    return validationError2(`invalid calendar date for ${context}.`);
  }
  const statementYear = statementDate.getUTCFullYear();
  for (let year = statementYear; year >= statementYear - 400; year -= 1) {
    const candidate = createUtcDate(year, month, day);
    if (candidate && candidate.getTime() <= statementDate.getTime()) {
      return candidate;
    }
  }
  return validationError2(`invalid calendar date for ${context}.`);
}
function parseTransaction2(line, lineNumber, statementDate) {
  const match = line.match(TRANSACTION_PATTERN2);
  if (!match) {
    return validationError2(`malformed transaction row on line ${lineNumber}.`);
  }
  const [, saleMonth, saleDay, postingMonth, postingDay, description, amountText] = match;
  const transactionDate = inferTransactionDate(
    saleMonth,
    saleDay,
    statementDate,
    `transaction date on line ${lineNumber}`
  );
  const postingDate = inferTransactionDate(
    postingMonth,
    postingDay,
    statementDate,
    `posting date on line ${lineNumber}`
  );
  const amountCents = parseCents2(
    amountText,
    `transaction on line ${lineNumber}`
  );
  if (!description.trim()) {
    return validationError2(`transaction on line ${lineNumber} has no description.`);
  }
  return {
    transaction: {
      transactionDate,
      postingDate,
      description: description.trim(),
      amount: centsToMoney(amountCents)
    },
    amountCents
  };
}
function parseActivity2(lines, statementDate) {
  const transactions = [];
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
      validationError2(`unsupported numeric transaction row on line ${lineNumber}.`);
    }
    if (!TRANSACTION_PREFIX_PATTERN2.test(trimmedLine)) return;
    const parsedTransaction = parseTransaction2(
      trimmedLine,
      lineNumber,
      statementDate
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
    validationError2("no card activity sections were found.");
  }
  if (transactions.length === 0) {
    validationError2("no Transactions were extracted from the card activity sections.");
  }
  return {
    transactions,
    positiveActivityCents,
    negativeActivityCents,
    totalExtractedCents
  };
}
function readControls2(lines) {
  return {
    statementDate: parseStatementDate2(lines),
    previousBalanceCents: extractFirstLabeledCents2(lines, "Previous Balance"),
    purchasesAndDebitsCents: extractFirstLabeledCents2(
      lines,
      "Plus: Purchases/Debits"
    ),
    cashAdvancesCents: extractFirstLabeledCents2(lines, "Cash Advances"),
    installmentCents: extractFirstLabeledCents2(lines, "Installment"),
    feesAndChargesCents: extractFirstLabeledCents2(lines, "Fees/Charges"),
    paymentsCents: extractFirstLabeledCents2(lines, "Less: Payments"),
    creditsCents: extractFirstLabeledCents2(lines, "Credits"),
    totalStatementBalanceCents: extractFirstLabeledCents2(
      lines,
      "Total Statement Balance"
    )
  };
}
function validateActivity2(controls, activity) {
  const expectedPositiveActivityCents = controls.purchasesAndDebitsCents + controls.cashAdvancesCents + controls.installmentCents + controls.feesAndChargesCents;
  if (activity.positiveActivityCents !== expectedPositiveActivityCents) {
    validationError2(
      "positive activity does not match Purchases/Debits plus Cash Advances, Installment, and Fees/Charges."
    );
  }
  const expectedNegativeActivityCents = controls.paymentsCents + controls.creditsCents;
  if (activity.negativeActivityCents !== expectedNegativeActivityCents) {
    validationError2("negative activity does not match Payments plus Credits.");
  }
  if (controls.previousBalanceCents + activity.totalExtractedCents !== controls.totalStatementBalanceCents) {
    validationError2(
      "Previous Balance plus net activity does not match Total Statement Balance."
    );
  }
}
var eastwestVisaTransformer = {
  provider: EASTWEST_PROVIDER,
  matches(firstPageText) {
    return hasStatementEvidence(firstPageText, "EastWest") && hasStatementEvidence(firstPageText, "Visa") && /\b(?:PESO|PHP)\b/iu.test(firstPageText) && !hasNonPhpStatementCurrencyEvidence(firstPageText);
  },
  transform(statementText) {
    const lines = statementText.split(/\r?\n/u);
    const controls = readControls2(lines);
    const activity = parseActivity2(lines, controls.statementDate);
    validateActivity2(controls, activity);
    return {
      summary: {
        statementType: "credit_card",
        statementDate: controls.statementDate,
        provider: "EastWest",
        accountType: "Visa",
        transactionHistoryStartDate: null,
        totalDebit: null,
        totalTransactions: activity.transactions.length,
        totalAmountDue: centsToMoney(controls.totalStatementBalanceCents),
        totalExtractedAmount: centsToMoney(activity.totalExtractedCents)
      },
      transactions: activity.transactions
    };
  }
};

// ../web/src/features/statement-import/statement-import-utils.ts
function cleanDescription(value) {
  return value.trim().replace(/\s+/g, " ");
}

// ../web/src/features/statement-import/statement-parser/gcash-ewallet-transformer.ts
var GCASH_PROVIDER = "GCash E-Wallet";
var GCASH_TITLE_PATTERN = /^GCash Transaction History$/iu;
var DATE_RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/u;
var TIME_PATTERN = "(?:0?[1-9]|1[0-2]):[0-5]\\d\\s+[AP]M";
var TRANSACTION_PATTERN3 = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2})\\s+(${TIME_PATTERN})\\s+(.+?)\\s+(\\d+)\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})\\s+(${MONEY_AMOUNT_PATTERN_SOURCE})$`,
  "iu"
);
var TRANSACTION_START_PATTERN = new RegExp(
  `^\\d{4}-\\d{2}-\\d{2}\\s+${TIME_PATTERN}\\s+.+$`,
  "iu"
);
var CALENDAR_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}\b/u;
var TABLE_HEADER_PATTERN = /^Date and Time\s+Description\s+Reference No\.\s+Debit\s+Credit\s+Balance$/iu;
var CONTROL_LABELS = [
  "STARTING BALANCE",
  "ENDING BALANCE",
  "Total Debit",
  "Total Credit"
];
function validationError3(reason) {
  throw new StatementTransformationError(
    "validation",
    `${GCASH_PROVIDER} statement validation failed: ${reason}`,
    GCASH_PROVIDER
  );
}
function normalizeLine(line) {
  return line.trim().replace(/\s+/gu, " ");
}
function parseCalendarDate(value, context) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return validationError3(`invalid date for ${context}.`);
  }
  const [yearText, monthText, dayText] = value.split("-");
  const date = createUtcDate(
    Number(yearText),
    Number(monthText),
    Number(dayText)
  );
  if (!date) return validationError3(`invalid calendar date for ${context}.`);
  return date;
}
function parseAmount(value, context) {
  const cents = parseStatementCents(value);
  if (cents === null || cents < 0) {
    return validationError3(`invalid amount for ${context}.`);
  }
  return cents;
}
function findControlLine(lines, label) {
  const line = lines.find((candidate) => {
    const normalized = normalizeLine(candidate);
    return normalized.toLocaleLowerCase().startsWith(`${label.toLocaleLowerCase()} `);
  });
  if (!line) return validationError3(`missing ${label} control.`);
  return normalizeLine(line);
}
function parseControlAmount(lines, label) {
  const line = findControlLine(lines, label);
  const amountText = line.slice(label.length).trim();
  return parseAmount(amountText, label);
}
function readControls3(lines) {
  if (!lines.some((line) => GCASH_TITLE_PATTERN.test(normalizeLine(line)))) {
    return validationError3("missing GCash Transaction History heading.");
  }
  const rangeLine = lines.find((line) => DATE_RANGE_PATTERN.test(normalizeLine(line)));
  if (!rangeLine) {
    return validationError3("missing or invalid statement date range.");
  }
  const rangeMatch = normalizeLine(rangeLine).match(DATE_RANGE_PATTERN);
  if (!rangeMatch) return validationError3("invalid statement date range.");
  const [, startDateText, statementDateText] = rangeMatch;
  const startDate = parseCalendarDate(startDateText, "statement range start");
  const statementDate = parseCalendarDate(
    statementDateText,
    "statement range end"
  );
  if (startDate.getTime() > statementDate.getTime()) {
    return validationError3("statement range start is after its end.");
  }
  if (!lines.some((line) => TABLE_HEADER_PATTERN.test(normalizeLine(line)))) {
    return validationError3("missing transaction table header.");
  }
  parseControlAmount(lines, "STARTING BALANCE");
  parseControlAmount(lines, "ENDING BALANCE");
  return {
    startDate,
    statementDate,
    totalDebitCents: parseControlAmount(lines, "Total Debit"),
    totalCreditCents: parseControlAmount(lines, "Total Credit")
  };
}
function isControlLine(line) {
  const normalized = normalizeLine(line);
  return GCASH_TITLE_PATTERN.test(normalized) || DATE_RANGE_PATTERN.test(normalized) || TABLE_HEADER_PATTERN.test(normalized) || CONTROL_LABELS.some(
    (label) => normalized.toLocaleLowerCase().startsWith(`${label.toLocaleLowerCase()} `)
  );
}
function isIncomingDescription(description) {
  return /^(?:Refund|Received)\b/iu.test(description);
}
function parseTransaction3(rowLines, lineNumber, controls) {
  const row = rowLines.map(normalizeLine).filter(Boolean).join(" ");
  const match = row.match(TRANSACTION_PATTERN3);
  if (!match) {
    return validationError3(`malformed transaction row on line ${lineNumber}.`);
  }
  const [
    ,
    dateText,
    ,
    descriptionText,
    referenceNumber,
    amountText,
    balanceText
  ] = match;
  const transactionDate = parseCalendarDate(
    dateText,
    `transaction date on line ${lineNumber}`
  );
  if (transactionDate.getTime() < controls.startDate.getTime() || transactionDate.getTime() > controls.statementDate.getTime()) {
    return validationError3(
      `transaction date on line ${lineNumber} is outside the statement range.`
    );
  }
  const baseDescription = cleanDescription(descriptionText);
  if (!baseDescription) {
    return validationError3(`transaction on line ${lineNumber} has no description.`);
  }
  const amountMagnitudeCents = parseAmount(
    amountText,
    `transaction on line ${lineNumber}`
  );
  parseAmount(balanceText, `running Balance on line ${lineNumber}`);
  const providerAmountCents = isIncomingDescription(baseDescription) ? -amountMagnitudeCents : amountMagnitudeCents;
  return {
    transaction: {
      transactionDate,
      postingDate: transactionDate,
      description: baseDescription,
      amount: centsToMoney(providerAmountCents),
      reference: referenceNumber
    },
    amountMagnitudeCents
  };
}
function parseActivity3(lines, controls) {
  const transactions = [];
  let totalExtractedCents = 0;
  let totalExtractedMagnitudeCents = 0;
  let activeRow = null;
  function flushActiveRow() {
    if (!activeRow) return;
    const parsed = parseTransaction3(
      activeRow.lines,
      activeRow.lineNumber,
      controls
    );
    transactions.push(parsed.transaction);
    totalExtractedCents += moneyToCents(parsed.transaction.amount);
    totalExtractedMagnitudeCents += parsed.amountMagnitudeCents;
    activeRow = null;
  }
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const normalizedLine = normalizeLine(line);
    if (!normalizedLine) return;
    if (TRANSACTION_START_PATTERN.test(normalizedLine)) {
      flushActiveRow();
      activeRow = { lines: [normalizedLine], lineNumber };
      return;
    }
    if (isControlLine(normalizedLine)) {
      flushActiveRow();
      return;
    }
    if (CALENDAR_DATE_PREFIX_PATTERN.test(normalizedLine)) {
      return validationError3(`malformed transaction row on line ${lineNumber}.`);
    }
    if (!activeRow) {
      return validationError3(`unexpected statement row on line ${lineNumber}.`);
    }
    activeRow.lines.push(normalizedLine);
  });
  flushActiveRow();
  if (transactions.length === 0) {
    return validationError3("no Transactions were extracted from the activity.");
  }
  const expectedMagnitudeCents = controls.totalDebitCents + controls.totalCreditCents;
  if (totalExtractedMagnitudeCents !== expectedMagnitudeCents) {
    return validationError3(
      "extracted row amounts do not match Total Debit plus Total Credit."
    );
  }
  return {
    transactions,
    totalExtractedCents,
    totalExtractedMagnitudeCents
  };
}
var gcashEwalletTransformer = {
  provider: GCASH_PROVIDER,
  matches(statementText) {
    return hasStatementEvidence(statementText, "GCash") && /\bGCash\s+Transaction\s+History\b/iu.test(statementText);
  },
  transform(statementText) {
    const lines = statementText.split(/\r?\n/u);
    const controls = readControls3(lines);
    const activity = parseActivity3(lines, controls);
    return {
      summary: {
        statementType: "e_wallet",
        statementDate: controls.statementDate,
        provider: "GCash",
        accountType: "E-Wallet",
        transactionHistoryStartDate: controls.startDate,
        totalDebit: centsToMoney(controls.totalDebitCents),
        totalTransactions: activity.transactions.length,
        totalAmountDue: centsToMoney(controls.totalDebitCents),
        totalExtractedAmount: centsToMoney(activity.totalExtractedCents)
      },
      transactions: activity.transactions
    };
  }
};

// ../web/src/features/statement-import/statement-parser/transformer.ts
var supportedStatementTransformers = [bdoAmexTransformer, eastwestVisaTransformer, gcashEwalletTransformer];
function selectStatementTransformer(statementText, transformers = supportedStatementTransformers) {
  const matches = transformers.filter(
    (transformer) => transformer.matches(statementText)
  );
  if (matches.length === 0) {
    throw new StatementTransformationError(
      "unsupported",
      "Unsupported statement: no supported provider matched the statement."
    );
  }
  if (matches.length > 1) {
    throw new StatementTransformationError(
      "ambiguous",
      "Ambiguous statement: more than one provider matched the statement."
    );
  }
  return matches[0];
}
function transformStatement(statementText, transformers = supportedStatementTransformers) {
  return selectStatementTransformer(statementText, transformers).transform(
    statementText
  );
}
