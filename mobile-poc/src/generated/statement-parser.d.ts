export interface StatementSummary {
  statementType: "credit_card" | "e_wallet";
  statementDate: Date;
  provider: string;
  accountType: string;
  transactionHistoryStartDate: Date | null;
  totalDebit: number | null;
  totalTransactions: number;
  totalAmountDue: number;
  totalExtractedAmount: number;
}

export interface Transaction {
  transactionDate: Date;
  postingDate: Date;
  description: string;
  amount: number;
  reference?: string;
}

export interface Statement {
  summary: StatementSummary;
  transactions: Transaction[];
}

export type StatementTransformationErrorCode =
  | "unsupported"
  | "ambiguous"
  | "validation";

export class StatementTransformationError extends Error {
  readonly code: StatementTransformationErrorCode;
  readonly provider: string | null;
  constructor(
    code: StatementTransformationErrorCode,
    message: string,
    provider?: string | null,
  );
}

export function transformStatement(statementText: string): Statement;
