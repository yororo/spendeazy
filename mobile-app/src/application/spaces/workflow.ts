import type { Session } from '../session.ts';
import { requestFailureMessage } from '../../api/request-failure.ts';
import { selectActiveSpace, type AccessibleSpace } from './active-space.ts';

type SpacesState = {
  spaces: AccessibleSpace[];
  active: AccessibleSpace | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  memoryError: string | null;
  requestId: number;
};
type SpacesEvent =
  | { type: 'loadStarted' }
  | { type: 'cancelled' }
  | { type: 'loadSucceeded'; requestId: number; spaces: AccessibleSpace[]; active: AccessibleSpace | null }
  | { type: 'loadFailed'; requestId: number; error: string }
  | { type: 'loadFinished'; requestId: number }
  | { type: 'selected'; active: AccessibleSpace }
  | { type: 'memorySaved'; saved: boolean };

function spacesReducer(state: SpacesState, event: SpacesEvent): SpacesState {
  switch (event.type) {
    case 'loadStarted': return { ...state, requestId: state.requestId + 1, refreshing: true, error: null };
    case 'cancelled': return { ...state, requestId: state.requestId + 1, refreshing: false };
    case 'selected': return { ...state, requestId: state.requestId + 1, active: event.active, refreshing: false };
    case 'memorySaved': return { ...state, memoryError: event.saved ? null : 'This device could not remember the active Space.' };
  }
  if (event.requestId !== state.requestId) return state;
  switch (event.type) {
    case 'loadSucceeded': return { ...state, spaces: event.spaces, active: event.active, loading: false };
    case 'loadFailed': return { ...state, error: event.error, loading: false };
    case 'loadFinished': return { ...state, refreshing: false };
  }
}
type SpacesAdapters = {
  provision: () => Promise<void>;
  list: () => Promise<AccessibleSpace[]>;
  read: (userId: string) => Promise<string | null>;
  write: (userId: string, spaceId: string) => Promise<boolean>;
};

export function createSpacesWorkflow(session: Session, adapters: SpacesAdapters) {
  const ownerUserId = session.snapshot().userId;
  const empty: SpacesState = { spaces: [], active: null, loading: true, refreshing: false, error: null, memoryError: null, requestId: 0 };
  let state = empty;
  let scope = session.capture();
  let writes = Promise.resolve();
  let provisioning: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  function dispatch(event: SpacesEvent) {
    state = spacesReducer(state, event);
    for (const listener of listeners) listener();
  }
  function currentOwner() {
    return ownerUserId !== null && session.snapshot().userId === ownerUserId && session.snapshot().notice === null;
  }
  function ensureProvisioned() {
    // Share an in-flight attempt across refreshes; a failed attempt remains retryable.
    provisioning ??= adapters.provision().catch(cause => {
      provisioning = null;
      throw cause;
    });
    return provisioning;
  }
  function remember(space: AccessibleSpace) {
    const selectedScope = session.capture();
    // Serialize device writes so a slower previous choice cannot win on disk.
    writes = writes.then(async () => {
      if (!ownerUserId || !session.isCurrent(selectedScope)) return;
      const saved = await adapters.write(ownerUserId, space.id);
      if (session.isCurrent(selectedScope)) dispatch({ type: 'memorySaved', saved });
    });
    return writes;
  }
  return {
    snapshot: () => currentOwner() && session.isCurrent(scope) ? state : empty,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel() { dispatch({ type: 'cancelled' }); },
    async load() {
      if (!ownerUserId || !currentOwner()) return;
      dispatch({ type: 'loadStarted' });
      const requestId = state.requestId;
      const started = session.capture();
      try {
        await ensureProvisioned();
        if (requestId !== state.requestId || !session.isCurrent(started)) return;
        const spaces = await adapters.list();
        if (requestId !== state.requestId || !session.isCurrent(started)) return;
        const remembered = await adapters.read(ownerUserId);
        if (requestId !== state.requestId || !session.isCurrent(started)) return;
        const selected = selectActiveSpace(spaces, session.snapshot().spaceId ?? remembered);
        session.changeSpace(selected?.id ?? null);
        scope = session.capture();
        dispatch({ type: 'loadSucceeded', requestId, spaces, active: selected });
        if (selected && selected.id !== remembered) await remember(selected);
      } catch (cause) {
        if (session.isCurrent(started)) dispatch({ type: 'loadFailed', requestId, error: requestFailureMessage(cause) });
      } finally {
        if (currentOwner()) dispatch({ type: 'loadFinished', requestId });
      }
    },
    async select(spaceId: string) {
      if (!currentOwner() || !session.isCurrent(scope)) return;
      const space = state.spaces.find((item) => item.id === spaceId);
      if (!space || space.id === state.active?.id) return;
      session.changeSpace(space.id);
      scope = session.capture();
      dispatch({ type: 'selected', active: space });
      await remember(space);
    },
    discardUnsavedExpense() {
      if (!currentOwner() || !session.isCurrent(scope)) return;
      session.saveDraft(null);
    },
  };
}
