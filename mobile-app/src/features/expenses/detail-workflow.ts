import { requestFailure, requestFailureMessage, type RequestFailure } from '../../api/request-failure.ts';
import type { ListedExpense } from '../../api/expense-response.ts';

export type ExpenseDetailScope = { spaceId: string; expenseId: string };
type Operation = { id: number };
export type ExpenseDetailState = {
  expense: ListedExpense | null;
  phase: 'loading' | 'ready' | 'error';
  error: string | null;
  failure: RequestFailure | null;
  operation: Operation | null;
};
type DetailEvent =
  | { type: 'loadRequested'; id: number }
  | { type: 'loadSucceeded'; id: number; expense: ListedExpense }
  | { type: 'loadFailed'; id: number; error: string; failure: RequestFailure }
  | { type: 'cancelled' };

function detailReducer(state: ExpenseDetailState, event: DetailEvent): ExpenseDetailState {
  switch (event.type) {
    case 'loadRequested':
      return { ...state, operation: { id: event.id }, phase: 'loading', error: null, failure: null };
    case 'cancelled':
      return { ...state, operation: null };
    case 'loadSucceeded':
      if (state.operation?.id !== event.id) return state;
      return { ...state, expense: event.expense, operation: null, phase: 'ready', error: null, failure: null };
    case 'loadFailed':
      if (state.operation?.id !== event.id) return state;
      return { ...state, expense: null, operation: null, phase: 'error', error: event.error, failure: event.failure };
  }
}

/** One identity, Space, and Expense lifetime. Only the current read may commit. */
export function createExpenseDetailWorkflow(
  scope: ExpenseDetailScope,
  isCurrent: () => boolean,
  read: (spaceId: string, expenseId: string) => Promise<ListedExpense>,
) {
  const empty: ExpenseDetailState = { expense: null, phase: 'loading', error: null, failure: null, operation: null };
  let state = empty;
  let nextId = 0;
  const listeners = new Set<() => void>();
  function dispatch(event: DetailEvent) {
    const next = detailReducer(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }
  async function load(): Promise<boolean> {
    if (!isCurrent()) return false;
    const id = ++nextId;
    dispatch({ type: 'loadRequested', id });
    try {
      const expense = await read(scope.spaceId, scope.expenseId);
      if (!isCurrent() || state.operation?.id !== id) return false;
      dispatch({ type: 'loadSucceeded', id, expense });
      return true;
    } catch (cause) {
      if (!isCurrent() || state.operation?.id !== id) return false;
      dispatch({ type: 'loadFailed', id, error: requestFailureMessage(cause), failure: requestFailure(cause) });
      return false;
    }
  }
  return {
    snapshot: () => isCurrent() ? state : empty,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel() { dispatch({ type: 'cancelled' }); },
    load,
    retry: load,
  };
}
