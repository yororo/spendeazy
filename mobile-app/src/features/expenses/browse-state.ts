import type { ExpensePagePayload } from '../../api/expense-response.ts';
export { readExpensePage, readListedExpense, type ListedExpense, type ExpensePagePayload } from '../../api/expense-response.ts';

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
