import type { CategorizedStatement } from "./statement-categorizer";
import { normalizeDescription } from "./statement-import-utils";

const GCASH_PROVIDER = "GCash";
const GCASH_MOBILE_NUMBER_PATTERN = /^09\d{9}$/u;

function isGcashStatement(statement: Pick<CategorizedStatement, "summary">) {
  return statement.summary.provider === GCASH_PROVIDER;
}

function validateGcashMobileNumber(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue || GCASH_MOBILE_NUMBER_PATTERN.test(normalizedValue)) {
    return null;
  }

  return "Enter exactly 11 digits starting with 09.";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function applyGcashRecipientExclusion(
  statement: CategorizedStatement,
  recipient: string,
): CategorizedStatement {
  const normalizedRecipient = recipient.trim();
  if (
    !isGcashStatement(statement) ||
    !GCASH_MOBILE_NUMBER_PATTERN.test(normalizedRecipient)
  ) {
    return statement;
  }

  const transferToRecipientPattern = new RegExp(
    `^TRANSFER FROM .+ TO ${escapeRegExp(normalizedRecipient)}(?: \\[REF\\.\\s*#:\\s*[^\\]]+\\])?$`,
    "u",
  );

  return {
    ...statement,
    entries: statement.entries.map((expense) => {
      if (
        !transferToRecipientPattern.test(
          normalizeDescription(expense.description),
        )
      ) {
        return expense;
      }

      return {
        ...expense,
        amount: Math.abs(expense.amount),
        isExcluded: true,
      };
    }),
  };
}

export {
  applyGcashRecipientExclusion,
  isGcashStatement,
  validateGcashMobileNumber,
};
