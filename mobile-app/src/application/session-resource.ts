import { requestFailureMessage } from '../api/request-failure.ts';
import type { Session, SessionScope } from './session.ts';

type ResourceState<T> = { key: string; data: T | null; error: string | null; loading: boolean; appending: boolean; requestId: number };
type ResourceEvent<T> =
  | { type: 'loadStarted'; append: boolean }
  | { type: 'cancelled' }
  | { type: 'loadSucceeded'; requestId: number; page: T; append?: (current: T | null, page: T) => T }
  | { type: 'loadFailed'; requestId: number; error: string }
  | { type: 'loadFinished'; requestId: number };

function resourceReducer<T>(state: ResourceState<T>, event: ResourceEvent<T>): ResourceState<T> {
  if (event.type === 'loadStarted') return { ...state, requestId: state.requestId + 1, loading: true, appending: event.append, error: null };
  if (event.type === 'cancelled') return { ...state, requestId: state.requestId + 1, loading: false, appending: false };
  if (event.requestId !== state.requestId) return state;
  switch (event.type) {
    case 'loadSucceeded': return { ...state, data: event.append ? event.append(state.data, event.page) : event.page };
    case 'loadFailed': return { ...state, error: event.error };
    case 'loadFinished': return { ...state, loading: false, appending: false };
  }
}

/** Shared request lifecycle for Categories, Expense detail and Expense pages. */
export function createSessionResource<T>(session: Session, scope: SessionScope = session.capture(), key = '') {
  const empty: ResourceState<T> = { key, data: null, error: null, loading: false, appending: false, requestId: 0 };
  let state = empty;
  const listeners = new Set<() => void>();
  function dispatch(event: ResourceEvent<T>) {
    state = resourceReducer(state, event);
    for (const listener of listeners) listener();
  }
  return {
    snapshot: () => session.isCurrent(scope) ? state : empty,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel() { dispatch({ type: 'cancelled' }); },
    async load(operation: () => Promise<T>, append?: (current: T | null, page: T) => T) {
      if (!session.isCurrent(scope) || (append && state.loading)) return false;
      dispatch({ type: 'loadStarted', append: Boolean(append) });
      const requestId = state.requestId;
      try {
        const data = await operation();
        if (requestId !== state.requestId || !session.isCurrent(scope)) return false;
        dispatch({ type: 'loadSucceeded', requestId, page: data, append });
        return true;
      } catch (cause) {
        if (!session.isCurrent(scope)) return false;
        dispatch({ type: 'loadFailed', requestId, error: requestFailureMessage(cause) });
        return false;
      } finally {
        if (session.isCurrent(scope)) dispatch({ type: 'loadFinished', requestId });
      }
    },
  };
}
