import {
  categorizeTransactions,
  type AssignmentProvenance,
  type CategoryRule,
} from "./statement-import-service";
import { extractPdfPages } from "./statement-parser/pdf-extractor";
import { centsToMoney, moneyToCents } from "@/shared/money";
import {
  type StatementSummary,
  type Transaction,
  transformStatement,
} from "./statement-parser/transformer";

interface CategorizedTransaction extends Transaction {
  readonly activityKind?: "expense" | "payment" | "other_credit";
  readonly id: string;
  readonly categoryId: string | null;
  readonly assignment: AssignmentProvenance;
  readonly matchedCategoryIds: readonly string[];
  readonly isExcluded: boolean;
}

interface CategorizedStatement {
  summary: StatementSummary;
  transactions: CategorizedTransaction[];
}

function getActivityKind(
  transaction: Transaction,
  summary: StatementSummary,
): NonNullable<CategorizedTransaction["activityKind"]> {
  if (transaction.amount >= 0) return "expense";
  // Only recognized card payment descriptions distinguish payments from other credits.
  if (
    summary.statementType === "credit_card" &&
    /^(?:PAYMENT RECEIVED\b|INTERNET PAYMENT$)/i.test(transaction.description)
  ) {
    return "payment";
  }
  return "other_credit";
}

async function categorizeStatement(
  file: File,
  password?: string,
  rules: readonly CategoryRule[] = [],
  activeCategoryIds?: ReadonlySet<string>,
): Promise<CategorizedStatement> {
  const pages = await extractPdfPages(file, password);
  const statementText = pages.map(({ text }) => text).join("\n");
  console.log("Extracted statement text:", statementText);
  const transformedStatement = transformStatement(statementText);
  const extractedTransactions = transformedStatement.transactions;

  // Statement providers use the opposite sign convention from the ledger.
  const normalizedTransactions = extractedTransactions.map((transaction) => ({
    ...transaction,
    amount: -transaction.amount,
    activityKind: getActivityKind(transaction, transformedStatement.summary),
  }));
  const normalizedExtractedCents = normalizedTransactions.reduce(
    (total, transaction) => total + moneyToCents(transaction.amount),
    0,
  );
  const summary = {
    ...transformedStatement.summary,
    totalExtractedAmount: centsToMoney(normalizedExtractedCents),
  };

  const categorizations = categorizeTransactions(
    normalizedTransactions,
    rules,
    activeCategoryIds,
  );
  const transactions = normalizedTransactions.map((transaction, index) => ({
    ...transaction,
    id: `transaction-${index + 1}`,
    categoryId: categorizations[index]?.categoryId ?? null,
    assignment: categorizations[index]?.assignment ?? "unmapped",
    matchedCategoryIds: categorizations[index]?.matchedCategoryIds ?? [],
    isExcluded: transaction.amount > 0,
  }));

  return { summary, transactions };
}

export { categorizeStatement };
export type { CategorizedStatement, CategorizedTransaction };
