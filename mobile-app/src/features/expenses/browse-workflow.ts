import { requestFailure, requestFailureMessage, type RequestFailure } from '../../api/request-failure.ts';
import type { ExpensePagePayload } from '../../api/expense-response.ts';
import { applyExpensePage, expenseBrowseIssues, expenseListQuery, type ExpenseBrowseSelection, type ExpenseListRequest } from './browse-state.ts';

type Operation = { id: number; kind: 'replace' | 'append' };
export type ExpenseBrowseState = {
  loaded: ExpensePagePayload | null;
  phase: 'loading' | 'refreshing' | 'appending' | 'ready' | 'error';
  error: string | null;
  failure: RequestFailure | null;
  operation: Operation | null;
  retryKind: Operation['kind'];
};
type BrowseEvent =
  | { type: 'replacementRequested' | 'paginationRequested'; id: number }
  | { type: 'loadSucceeded'; id: number; page: ExpensePagePayload }
  | { type: 'loadFailed'; id: number; error: string; failure: RequestFailure }
  | { type: 'cancelled' };

function browseReducer(state: ExpenseBrowseState, event: BrowseEvent): ExpenseBrowseState {
  switch (event.type) {
    case 'replacementRequested':
    case 'paginationRequested': {
      const kind = event.type === 'paginationRequested' ? 'append' : 'replace';
      return { ...state, operation: { id: event.id, kind }, retryKind: kind, error: null, failure: null,
        phase: kind === 'append' ? 'appending' : state.loaded ? 'refreshing' : 'loading' };
    }
    case 'cancelled': return { ...state, operation: null, phase: state.loaded ? 'ready' : 'loading' };
    case 'loadSucceeded':
      if (state.operation?.id !== event.id) return state;
      return { ...state, loaded: applyExpensePage(state.operation.kind === 'append' ? state.loaded : null, event.page), operation: null, phase: 'ready' };
    case 'loadFailed':
      if (state.operation?.id !== event.id) return state;
      return { ...state, operation: null, phase: state.loaded ? 'ready' : 'error', error: event.error, failure: event.failure };
  }
}

/** One identity/Space/query lifetime. Replacement supersedes append; append never supersedes a pending load. */
export function createExpenseBrowseWorkflow(
  selection: ExpenseBrowseSelection,
  isCurrent: () => boolean,
  list: (spaceId: string, query: ExpenseListRequest) => Promise<ExpensePagePayload>,
) {
  const empty: ExpenseBrowseState = { loaded: null, phase: 'loading', error: null, failure: null, operation: null, retryKind: 'replace' };
  let state = empty;
  let nextId = 0;
  const listeners = new Set<() => void>();
  function dispatch(event: BrowseEvent) {
    const next = browseReducer(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }
  async function load(kind: Operation['kind']): Promise<boolean> {
    if (!isCurrent() || expenseBrowseIssues(selection).length) return false;
    if (kind === 'append' && (state.operation || !state.loaded?.nextCursor)) return false;
    const cursor = kind === 'append' ? state.loaded!.nextCursor! : undefined;
    const id = ++nextId;
    dispatch({ type: kind === 'append' ? 'paginationRequested' : 'replacementRequested', id });
    try {
      const page = await list(selection.spaceId, expenseListQuery(selection, cursor));
      if (!isCurrent() || state.operation?.id !== id) return false;
      dispatch({ type: 'loadSucceeded', id, page });
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
    reload: () => load('replace'),
    retry: () => load(state.retryKind),
    loadMore: () => load('append'),
  };
}
