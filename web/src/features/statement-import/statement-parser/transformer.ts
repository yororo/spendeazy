import { bdoAmexTransformer } from "./bdo-amex-transformer";
import { eastwestVisaTransformer } from "./eastwest-visa-transformer";
import { gcashEwalletTransformer } from "./gcash-ewallet-transformer";
import {
  StatementTransformationError,
} from "./statement-transformation-error";
import type {
  StatementTransformationErrorCode,
} from "./statement-transformation-error";

interface Statement {
  summary: StatementSummary;
  transactions: Transaction[];
}

interface StatementSummary {
  statementDate: Date;
  provider: string;
  accountType: string;
  totalTransactions: number;
  totalAmountDue: number;
  totalExtractedAmount: number;
}

interface Transaction {
  transactionDate: Date;
  postingDate: Date;
  description: string;
  amount: number;
}

interface StatementTransformer {
  readonly provider: string;
  matches(statementText: string): boolean;
  transform(statementText: string): Statement;
}

const supportedStatementTransformers: readonly StatementTransformer[] =
  [bdoAmexTransformer, eastwestVisaTransformer, gcashEwalletTransformer];

function selectStatementTransformer(
  statementText: string,
  transformers: readonly StatementTransformer[] = supportedStatementTransformers,
): StatementTransformer {
  const matches = transformers.filter((transformer) =>
    transformer.matches(statementText),
  );

  if (matches.length === 0) {
    throw new StatementTransformationError(
      "unsupported",
      "Unsupported statement: no supported provider matched the statement.",
    );
  }

  if (matches.length > 1) {
    throw new StatementTransformationError(
      "ambiguous",
      "Ambiguous statement: more than one provider matched the statement.",
    );
  }

  return matches[0];
}

function transformStatement(
  statementText: string,
  transformers: readonly StatementTransformer[] = supportedStatementTransformers,
): Statement {
  return selectStatementTransformer(statementText, transformers).transform(
    statementText,
  );
}

export {
  selectStatementTransformer,
  StatementTransformationError,
  supportedStatementTransformers,
  transformStatement,
};
export type {
  Statement,
  StatementSummary,
  StatementTransformer,
  Transaction,
  StatementTransformationErrorCode,
};
