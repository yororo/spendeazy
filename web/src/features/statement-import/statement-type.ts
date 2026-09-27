import type { StatementType } from "./statement-parser/transformer";

function formatStatementType(statementType: StatementType): string {
  return statementType === "e_wallet" ? "E-Wallet" : "Credit Card";
}

export { formatStatementType };
export type { StatementType };
