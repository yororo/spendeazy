import {
  categorizeStatementEntries,
  type AssignmentProvenance,
  type CategoryRule,
} from "./statement-import-service";
import { extractPdfPages } from "./statement-parser/pdf-extractor";
import { centsToMoney, moneyToCents } from "@/shared/money";
import {
  type StatementSummary,
  type StatementEntry,
  transformStatement,
} from "./statement-parser/transformer";

interface CategorizedStatementEntry extends StatementEntry {
  readonly activityKind?: "expense" | "payment" | "other_credit";
  readonly id: string;
  readonly categoryId: string | null;
  readonly assignment: AssignmentProvenance;
  readonly matchedCategoryIds: readonly string[];
  readonly isExcluded: boolean;
}

interface CategorizedStatement {
  summary: StatementSummary;
  entries: CategorizedStatementEntry[];
}

function getActivityKind(
  expense: StatementEntry,
  summary: StatementSummary,
): NonNullable<CategorizedStatementEntry["activityKind"]> {
  if (expense.amount >= 0) return "expense";
  // Only recognized card payment descriptions distinguish payments from other credits.
  if (
    summary.statementType === "credit_card" &&
    /^(?:PAYMENT RECEIVED\b|INTERNET PAYMENT$)/i.test(expense.description)
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
  const extractedExpenses = transformedStatement.entries;

  // Statement providers use the opposite sign convention from the ledger.
  const normalizedExpenses = extractedExpenses.map((expense) => ({
    ...expense,
    amount: -expense.amount,
    activityKind: getActivityKind(expense, transformedStatement.summary),
  }));
  const normalizedExtractedCents = normalizedExpenses.reduce(
    (total, expense) => total + moneyToCents(expense.amount),
    0,
  );
  const summary = {
    ...transformedStatement.summary,
    totalExtractedAmount: centsToMoney(normalizedExtractedCents),
  };

  const categorizations = categorizeStatementEntries(
    normalizedExpenses,
    rules,
    activeCategoryIds,
  );
  const expenses = normalizedExpenses.map((expense, index) => ({
    ...expense,
    id: `expense-${index + 1}`,
    categoryId: categorizations[index]?.categoryId ?? null,
    assignment: categorizations[index]?.assignment ?? "unmapped",
    matchedCategoryIds: categorizations[index]?.matchedCategoryIds ?? [],
    isExcluded: expense.amount > 0,
  }));

  return { summary, entries: expenses };
}

export { categorizeStatement };
export type { CategorizedStatement, CategorizedStatementEntry };
