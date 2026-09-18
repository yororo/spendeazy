const UNSIGNED_MONEY_AMOUNT_PATTERN_SOURCE =
  "(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}";
const MONEY_AMOUNT_PATTERN_SOURCE = `-?${UNSIGNED_MONEY_AMOUNT_PATTERN_SOURCE}`;
const MONEY_AMOUNT_PATTERN = new RegExp(
  `^${MONEY_AMOUNT_PATTERN_SOURCE}$`,
  "u",
);

function hasStatementEvidence(statementText: string, evidence: string) {
  return new RegExp(`\\b${evidence}\\b`, "iu").test(statementText);
}

function hasNonPhpStatementCurrencyEvidence(statementText: string) {
  return statementText.split(/\r?\n/u).some(
    (line) =>
      /\b(?:BDO|AMEX|EastWest|Visa)\b[^\r\n]*\bdual[- ]currency\b/iu.test(
        line,
      ) ||
      /\bdual[- ]currency\b[^\r\n]*\b(?:BDO|AMEX|EastWest|Visa)\b/iu.test(
        line,
      ) ||
      /\bstatement\b[^\r\n]*(?:\bUSD\b|\bEUR\b|\bUS dollars?\b)/iu.test(
        line,
      ) ||
      /^(?:SALE POST )?CURRENCY\s+(?:USD|EUR)\b/iu.test(line.trim()) ||
      /\((?:USD|EUR)\)/iu.test(line),
  );
}

function parseStatementCents(value: string): number | null {
  const normalizedValue = value.trim();
  if (!MONEY_AMOUNT_PATTERN.test(normalizedValue)) return null;

  const isNegative = normalizedValue.startsWith("-");
  const unsignedValue = isNegative ? normalizedValue.slice(1) : normalizedValue;
  const [integerPart, fractionalPart] = unsignedValue
    .replace(/,/gu, "")
    .split(".");
  const cents = Number(integerPart) * 100 + Number(fractionalPart);

  if (!Number.isSafeInteger(cents)) return null;

  return cents === 0 ? 0 : isNegative ? -cents : cents;
}

function extractMoneyToken(value: string) {
  const match = value.trim().match(
    new RegExp(`(${MONEY_AMOUNT_PATTERN_SOURCE})$`, "u"),
  );
  if (!match) return null;

  const prefix = value.trim().slice(0, -match[1].length);
  if (/\d/u.test(prefix)) return null;

  return match[1];
}

function createUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export {
  MONEY_AMOUNT_PATTERN_SOURCE,
  createUtcDate,
  extractMoneyToken,
  hasNonPhpStatementCurrencyEvidence,
  hasStatementEvidence,
  parseStatementCents,
};
