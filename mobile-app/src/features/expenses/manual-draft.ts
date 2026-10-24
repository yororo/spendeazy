export type ManualExpenseDraft = {
  amount: string;
  description: string;
  categoryId: string | null;
  expenseDate: string;
};

export type ManualExpenseField = 'amount' | 'description' | 'categoryId' | 'expenseDate';

export type ManualExpenseIssue = {
  field: ManualExpenseField;
  message: string;
};

export type ManualExpenseRequest = {
  amount: string;
  description: string;
  categoryId: string;
  expenseDate: string;
};

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXACT_PESO_INPUT = /^(?:0|[1-9]\d{0,12})(?:\.\d{0,2})?$/;

export function todayInManila(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function defaultManualExpenseDraft(today: string): ManualExpenseDraft {
  return {
    amount: '',
    description: '',
    categoryId: null,
    expenseDate: today,
  };
}

export type ManualCategoryEligibility = {
  spaceId: string;
  items: readonly { id: string; isActive: boolean }[];
};

export function prepareManualExpense(
  draft: ManualExpenseDraft,
  context: { now: Date; spaceId: string; categories: ManualCategoryEligibility },
): { ok: true; input: ManualExpenseRequest } | { ok: false; issues: ManualExpenseIssue[] } {
  const today = todayInManila(context.now);
  const amount = exactPositivePhp(draft.amount);
  const issues: ManualExpenseIssue[] = [];
  if (amount === null) {
    issues.push({
      field: 'amount',
      message: 'Enter a positive peso amount with exact centavos, such as 12.50.',
    });
  }
  if (draft.description.trim().length === 0) {
    issues.push({
      field: 'description',
      message: 'Enter a description.',
    });
  }
  if (!draft.categoryId || context.categories.spaceId !== context.spaceId ||
    !context.categories.items.some((category) => category.id === draft.categoryId && category.isActive)) {
    issues.push({
      field: 'categoryId',
      message: 'Choose an active Category.',
    });
  }
  if (!isCalendarDate(draft.expenseDate)) {
    issues.push({
      field: 'expenseDate',
      message: 'Enter a date as YYYY-MM-DD.',
    });
  } else if (draft.expenseDate > today) {
    issues.push({
      field: 'expenseDate',
      message: 'Expense date cannot be after today in Manila.',
    });
  }
  if (issues.length || amount === null || draft.categoryId === null) return { ok: false, issues };
  return { ok: true, input: {
    amount,
    description: draft.description.trim(),
    categoryId: draft.categoryId,
    expenseDate: draft.expenseDate,
  } };
}

function exactPositivePhp(value: string): string | null {
  const trimmed = value.trim();
  if (!EXACT_PESO_INPUT.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const cents = fraction.padEnd(2, '0');
  if (!/[1-9]/.test(`${whole}${cents}`)) return null;
  return `${whole}.${cents}`;
}

function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
