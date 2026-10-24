export const EXPENSE_PAGE_SIZE = 20;

export type ExpenseSort = 'newest' | 'oldest';

export type ExpenseBrowseSelection = {
  spaceId: string;
  fromDate: string;
  toDate: string;
  categoryId: string | null;
  description: string;
  sort: ExpenseSort;
};

export type ListedExpense = {
  id: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  amount: string;
  source: 'manual' | 'imported';
  addedByUserId: string | null;
  statementImportId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: string;
};

export type ExpensePagePayload = {
  expenses: ListedExpense[];
  nextCursor: string | null;
  totalCount: string;
  totalAmount: string;
};

export type ExpenseListRequest = {
  fromDate?: string;
  toDate?: string;
  categoryId?: string;
  description?: string;
  sort: ExpenseSort;
  pageSize: number;
  cursor?: string;
};

export function emptyExpenseBrowse(spaceId: string): ExpenseBrowseSelection {
  return {
    spaceId,
    fromDate: '',
    toDate: '',
    categoryId: null,
    description: '',
    sort: 'newest',
  };
}

export type ExpenseBrowseIssue = {
  field: 'fromDate' | 'toDate' | 'range';
  message: string;
};

export function expenseBrowseIssues(selection: ExpenseBrowseSelection): ExpenseBrowseIssue[] {
  const issues: ExpenseBrowseIssue[] = [];
  if (selection.fromDate !== '' && !isCalendarDate(selection.fromDate)) {
    issues.push({ field: 'fromDate', message: 'Enter the start date as YYYY-MM-DD.' });
  }
  if (selection.toDate !== '' && !isCalendarDate(selection.toDate)) {
    issues.push({ field: 'toDate', message: 'Enter the end date as YYYY-MM-DD.' });
  }
  if (
    issues.length === 0 &&
    selection.fromDate !== '' &&
    selection.toDate !== '' &&
    selection.fromDate > selection.toDate
  ) {
    issues.push({
      field: 'range',
      message: 'The start date must be on or before the end date.',
    });
  }
  return issues;
}

export function expenseListQuery(
  selection: ExpenseBrowseSelection,
  cursor?: string,
): ExpenseListRequest {
  const description = selection.description.trim();
  return {
    ...(selection.fromDate === '' ? {} : { fromDate: selection.fromDate }),
    ...(selection.toDate === '' ? {} : { toDate: selection.toDate }),
    ...(selection.categoryId === null ? {} : { categoryId: selection.categoryId }),
    ...(description === '' ? {} : { description }),
    sort: selection.sort,
    pageSize: EXPENSE_PAGE_SIZE,
    ...(cursor === undefined ? {} : { cursor }),
  };
}

export function applyExpensePage(
  current: ExpensePagePayload | null,
  page: ExpensePagePayload,
): ExpensePagePayload {
  return {
    expenses: current === null ? page.expenses : [...current.expenses, ...page.expenses],
    nextCursor: page.nextCursor,
    totalCount: page.totalCount,
    totalAmount: page.totalAmount,
  };
}

export function readExpensePage(value: unknown): ExpensePagePayload {
  if (!isRecord(value) || !Array.isArray(value.expenses)) {
    throw new Error('Expenses response must include an expense page');
  }
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') {
    throw new Error('Expenses response must include a cursor or null');
  }
  if (typeof value.totalCount !== 'string' || typeof value.totalAmount !== 'string') {
    throw new Error('Expenses response must include the full-selection totals');
  }
  return {
    expenses: value.expenses.map(readListedExpense),
    nextCursor: value.nextCursor,
    totalCount: value.totalCount,
    totalAmount: value.totalAmount,
  };
}

let selection: ExpenseBrowseSelection | null = null;
let scrollOffset = 0;
let listRevision = 0;
let snapshot: ExpenseBrowseSnapshot = { selection: null, listRevision: 0 };
const listeners = new Set<() => void>();

export type ExpenseBrowseSnapshot = {
  selection: ExpenseBrowseSelection | null;
  listRevision: number;
};

export function subscribeExpenseBrowse(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function expenseBrowseSnapshot(): ExpenseBrowseSnapshot {
  return snapshot;
}

export function readExpenseBrowse(spaceId: string): ExpenseBrowseSelection | null {
  return selection?.spaceId === spaceId ? selection : null;
}

export function readExpenseScroll(): number {
  return scrollOffset;
}

export function readExpenseListRevision(): number {
  return listRevision;
}

export function ensureExpenseBrowse(spaceId: string): ExpenseBrowseSelection {
  if (selection?.spaceId === spaceId) return selection;
  selection = emptyExpenseBrowse(spaceId);
  scrollOffset = 0;
  emit();
  return selection;
}

export function updateExpenseBrowse(
  spaceId: string,
  patch: Partial<Omit<ExpenseBrowseSelection, 'spaceId'>>,
): ExpenseBrowseSelection {
  const current = selection?.spaceId === spaceId ? selection : emptyExpenseBrowse(spaceId);
  selection = { ...current, ...patch, spaceId };
  scrollOffset = 0;
  emit();
  return selection;
}

export function rememberExpenseScroll(offset: number): void {
  scrollOffset = offset;
}

export function noteManualExpenseSaved(): void {
  listRevision += 1;
  emit();
}

export function clearExpenseBrowse(): void {
  selection = null;
  scrollOffset = 0;
  emit();
}

function emit(): void {
  snapshot = { selection, listRevision };
  for (const listener of listeners) listener();
}

export function readListedExpense(value: unknown): ListedExpense {
  if (!isRecord(value)) throw new Error('Expenses response must include expense records');
  const source = value.source;
  if (source !== 'manual' && source !== 'imported') {
    throw new Error('Expenses response must name a manual or imported source');
  }
  return {
    id: requiredString(value.id, 'Expense id'),
    categoryId: requiredString(value.categoryId, 'Category id'),
    expenseDate: requiredString(value.expenseDate, 'Expense date'),
    description: requiredString(value.description, 'Expense description'),
    amount: requiredString(value.amount, 'Expense amount'),
    source,
    addedByUserId: typeof value.addedByUserId === 'string' ? value.addedByUserId : null,
    statementImportId:
      typeof value.statementImportId === 'string' ? value.statementImportId : null,
    createdAt: requiredString(value.createdAt, 'Expense created time'),
    updatedAt: requiredString(value.updatedAt, 'Expense updated time'),
    revision: requiredString(value.revision, 'Expense revision'),
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expenses response must include ${label}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
