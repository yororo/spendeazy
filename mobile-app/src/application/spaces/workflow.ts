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
};
type SpacesAdapters = {
  list: () => Promise<AccessibleSpace[]>;
  read: (userId: string) => Promise<string | null>;
  write: (userId: string, spaceId: string) => Promise<boolean>;
};

export function createSpacesWorkflow(session: Session, adapters: SpacesAdapters) {
  const ownerUserId = session.snapshot().userId;
  const empty: SpacesState = { spaces: [], active: null, loading: true, refreshing: false, error: null, memoryError: null };
  let state = empty;
  let scope = session.capture();
  let request = 0;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  function publish(patch: Partial<SpacesState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  function currentOwner() {
    return ownerUserId !== null && session.snapshot().userId === ownerUserId && session.snapshot().notice === null;
  }
  function remember(space: AccessibleSpace) {
    const selectedScope = session.capture();
    // Serialize device writes so a slower previous choice cannot win on disk.
    writes = writes.then(async () => {
      if (!ownerUserId || !session.isCurrent(selectedScope)) return;
      const saved = await adapters.write(ownerUserId, space.id);
      if (session.isCurrent(selectedScope)) publish({ memoryError: saved ? null : 'This device could not remember the active Space.' });
    });
    return writes;
  }
  return {
    snapshot: () => currentOwner() && session.isCurrent(scope) ? state : empty,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel() { request += 1; },
    async load() {
      if (!ownerUserId || !currentOwner()) return;
      const operation = ++request;
      const started = session.capture();
      publish({ refreshing: true, error: null });
      try {
        const spaces = await adapters.list();
        if (operation !== request || !session.isCurrent(started)) return;
        const remembered = await adapters.read(ownerUserId);
        if (operation !== request || !session.isCurrent(started)) return;
        const selected = selectActiveSpace(spaces, session.snapshot().spaceId ?? remembered);
        session.changeSpace(selected?.id ?? null);
        scope = session.capture();
        publish({ spaces, active: selected, loading: false });
        if (selected && selected.id !== remembered) await remember(selected);
      } catch (cause) {
        if (operation === request && session.isCurrent(started)) publish({ error: requestFailureMessage(cause), loading: false });
      } finally {
        if (operation === request && currentOwner()) publish({ refreshing: false });
      }
    },
    async select(spaceId: string) {
      if (!currentOwner() || !session.isCurrent(scope)) return;
      const space = state.spaces.find((item) => item.id === spaceId);
      if (!space || space.id === state.active?.id) return;
      request += 1;
      session.changeSpace(space.id);
      scope = session.capture();
      publish({ active: space, refreshing: false });
      await remember(space);
    },
  };
}
