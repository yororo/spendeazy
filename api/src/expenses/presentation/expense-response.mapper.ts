import type { ExpenseActivityRecord } from '../application/expense-activity-store';
import type {
  ExpenseRecord,
  ManualExpenseRecord,
} from '../application/expense-store';
import type { ImportedExpenseRecord } from '../application/imported-expense-store';
import {
  ExpenseActivityResponseDto,
  ExpenseHistoryPageResponseDto,
  ImportedExpenseHistoryResponseDto,
  ImportedExpenseResponseDto,
  ManualExpenseHistoryResponseDto,
  ManualExpenseResponseDto,
} from './expense-response.dto';

export type ExpenseResponse =
  ManualExpenseResponseDto | ImportedExpenseResponseDto;

export type ExpenseHistoryResponse =
  ManualExpenseHistoryResponseDto | ImportedExpenseHistoryResponseDto;

export type ExpenseHistoryPageResponse = ExpenseHistoryPageResponseDto;

type ExpenseResponseInput = Pick<
  ExpenseRecord,
  | 'id'
  | 'categoryId'
  | 'expenseDate'
  | 'description'
  | 'amount'
  | 'source'
  | 'addedByUserId'
  | 'createdAt'
  | 'updatedAt'
  | 'revision'
> &
  Partial<Pick<ExpenseRecord, 'statementImportId'>>;

type ExpenseResponseFields = Omit<ManualExpenseResponseDto, 'source'>;

export function toExpenseResponse(
  expense: ExpenseResponseInput,
): ExpenseResponse {
  const response = toExpenseResponseFields(expense);

  if (expense.source === 'manual') {
    return { ...response, source: 'manual' };
  }

  if (expense.statementImportId == null) {
    throw new Error('Imported Expenses must reference a Statement Import');
  }
  return {
    ...response,
    source: 'imported',
    statementImportId: expense.statementImportId,
  };
}

export function toManualExpenseResponse(
  expense: ManualExpenseRecord,
): ManualExpenseResponseDto {
  return {
    ...toExpenseResponseFields(expense),
    source: 'manual',
  };
}

export function toExpenseHistoryResponse(
  expense: ExpenseRecord | ManualExpenseRecord | ImportedExpenseRecord,
): ExpenseHistoryResponse {
  const response = toExpenseResponseFields(expense);
  const historyResponse = {
    ...response,
    ...(expense.deletedAt == null
      ? {}
      : { deletedAt: expense.deletedAt.toISOString() }),
  };

  if (expense.source === 'manual') {
    return {
      ...historyResponse,
      source: 'manual',
      statementImportId: null,
    };
  }

  const statementImportId =
    'statementImportId' in expense ? expense.statementImportId : null;
  if (statementImportId === null) {
    throw new Error('Imported Expenses must reference a Statement import');
  }

  return {
    ...historyResponse,
    source: 'imported',
    statementImportId,
  };
}

export function toExpenseActivityResponse(
  activity: ExpenseActivityRecord,
): ExpenseActivityResponseDto {
  const response = {
    id: activity.id,
    expenseId: activity.expenseId,
    type: activity.type,
    actorUserId: activity.actorUserId,
    occurredAt: activity.occurredAt.toISOString(),
  };

  if (activity.type === 'created') {
    if (activity.before !== undefined) {
      throw new Error('Created Expense activity has invalid snapshots');
    }
    return activity.after === undefined
      ? response
      : { ...response, after: activity.after };
  }
  if (activity.type === 'deleted') {
    if (activity.after !== undefined) {
      throw new Error('Deleted Expense activity has invalid snapshots');
    }
    return activity.before === undefined
      ? response
      : { ...response, before: activity.before };
  }
  if (activity.before === undefined || activity.after === undefined) {
    throw new Error('Edited Expense activity is missing its snapshots');
  }
  return { ...response, before: activity.before, after: activity.after };
}

function toExpenseResponseFields(
  expense: ExpenseResponseInput,
): ExpenseResponseFields {
  return {
    id: expense.id,
    categoryId: expense.categoryId,
    expenseDate: expense.expenseDate,
    description: expense.description,
    amount: expense.amount,
    ...(expense.addedByUserId === undefined
      ? {}
      : { addedByUserId: expense.addedByUserId }),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    revision: expense.revision,
  };
}
