import { requestFailureMessage } from '../api/request-failure.ts';
import type { Session, SessionScope } from './session.ts';

type ResourceState<T> = { key: string; data: T | null; error: string | null; loading: boolean; appending: boolean };

/** Shared request lifecycle for Categories, Expense detail and Expense pages. */
export function createSessionResource<T>(session: Session, scope: SessionScope = session.capture(), key = '') {
  const empty: ResourceState<T> = { key, data: null, error: null, loading: false, appending: false };
  let state = empty;
  let request = 0;
  const listeners = new Set<() => void>();
  function publish(patch: Partial<ResourceState<T>>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  return {
    snapshot: () => session.isCurrent(scope) ? state : empty,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel() { request += 1; },
    async load(operation: () => Promise<T>, append?: (current: T | null, page: T) => T) {
      if (!session.isCurrent(scope) || (append && state.loading)) return false;
      const id = ++request;
      publish({ loading: true, appending: Boolean(append), error: null });
      try {
        const data = await operation();
        if (id !== request || !session.isCurrent(scope)) return false;
        publish({ data: append ? append(state.data, data) : data });
        return true;
      } catch (cause) {
        if (id !== request || !session.isCurrent(scope)) return false;
        publish({ error: requestFailureMessage(cause) });
        return false;
      } finally {
        if (id === request && session.isCurrent(scope)) publish({ loading: false, appending: false });
      }
    },
  };
}
