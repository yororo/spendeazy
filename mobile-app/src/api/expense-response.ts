import { InvalidApiResponseError } from "./request-failure.ts";

export type ListedExpense = {
  id: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  amount: string;
  source: "manual" | "imported";
  addedByUserId: string | null;
  statementImportId: string | null;
  sourceRowId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: string;
  deletedAt?: string;
};

export type ExpenseActivitySnapshot = {
  categoryId: string;
  expenseDate: string;
  description: string;
  amount: string;
};

export type ExpenseActivity = {
  id: string;
  expenseId: string;
  type: "created" | "edited" | "deleted";
  actorUserId: string;
  occurredAt: string;
  before?: ExpenseActivitySnapshot;
  after?: ExpenseActivitySnapshot;
};

export type ExpensePagePayload = {
  expenses: ListedExpense[];
  nextCursor: string | null;
  totalCount: string;
  totalAmount: string;
};

export function readExpensePage(value: unknown): ExpensePagePayload {
  if (!isRecord(value) || !Array.isArray(value.expenses)) {
    throw new InvalidApiResponseError();
  }
  if (value.nextCursor !== null && typeof value.nextCursor !== "string") {
    throw new InvalidApiResponseError();
  }
  if (
    typeof value.totalCount !== "string" ||
    !/^(?:0|[1-9]\d*)$/.test(value.totalCount)
  ) {
    throw new InvalidApiResponseError();
  }
  return {
    expenses: value.expenses.map(readListedExpense),
    nextCursor: value.nextCursor,
    totalCount: value.totalCount,
    totalAmount: readMoney(value.totalAmount),
  };
}

export function readListedExpense(value: unknown): ListedExpense {
  if (!isRecord(value)) throw new InvalidApiResponseError();
  const source = value.source;
  if (source !== "manual" && source !== "imported") {
    throw new InvalidApiResponseError();
  }
  return {
    id: requiredString(value.id, "Expense id"),
    categoryId: requiredString(value.categoryId, "Category id"),
    expenseDate: requiredString(value.expenseDate, "Expense date"),
    description: requiredString(value.description, "Expense description"),
    amount: readMoney(value.amount, true),
    source,
    addedByUserId:
      typeof value.addedByUserId === "string" ? value.addedByUserId : null,
    statementImportId:
      typeof value.statementImportId === "string"
        ? value.statementImportId
        : null,
    sourceRowId:
      typeof value.sourceRowId === "string" ? value.sourceRowId : null,
    createdAt: requiredString(value.createdAt, "Expense created time"),
    updatedAt: requiredString(value.updatedAt, "Expense updated time"),
    revision: requiredString(value.revision, "Expense revision"),
    ...(value.deletedAt === undefined || value.deletedAt === null
      ? {}
      : {
          deletedAt: requiredString(value.deletedAt, "Expense deletion time"),
        }),
  };
}

export function readExpenseActivityList(value: unknown): ExpenseActivity[] {
  if (!Array.isArray(value)) throw new InvalidApiResponseError();
  return value.map(readExpenseActivity);
}

function readExpenseActivity(value: unknown): ExpenseActivity {
  if (!isRecord(value)) throw new InvalidApiResponseError();
  const type = value.type;
  if (type !== "created" && type !== "edited" && type !== "deleted") {
    throw new InvalidApiResponseError();
  }
  const before =
    value.before === undefined ? undefined : readActivitySnapshot(value.before);
  const after =
    value.after === undefined ? undefined : readActivitySnapshot(value.after);
  if (
    (type === "edited" && (!before || !after)) ||
    (type === "created" && !after)
  ) {
    throw new InvalidApiResponseError();
  }
  return {
    id: requiredString(value.id, "Activity id"),
    expenseId: requiredString(value.expenseId, "Activity Expense id"),
    type,
    actorUserId: requiredString(value.actorUserId, "Activity actor id"),
    occurredAt: requiredString(value.occurredAt, "Activity time"),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };
}

function readActivitySnapshot(value: unknown): ExpenseActivitySnapshot {
  if (!isRecord(value)) throw new InvalidApiResponseError();
  return {
    categoryId: requiredString(value.categoryId, "Activity Category id"),
    expenseDate: requiredString(value.expenseDate, "Activity Expense date"),
    description: requiredString(value.description, "Activity description"),
    amount: readMoney(value.amount, true),
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidApiResponseError();
  }
  return value;
}

function readMoney(value: unknown, positive = false): string {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value) ||
    (positive && !/[1-9]/.test(value))
  ) {
    throw new InvalidApiResponseError();
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
