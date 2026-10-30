import { ExpenseApiError } from '../../api/request-failure.ts';
import type { DeletionStatus } from '../../api/account-deletion-api-client.ts';

export type AccountBinding = { userId: string; sessionId: string };
export type DeletionIntent = AccountBinding & { phase: 'submitted' | 'accepted' };
export type DeletionPhase = 'loading' | 'ready' | 'storage-error' | 'submitting' | 'uncertain' | 'pending' | 'completed' | 'ended';
type State = { phase: DeletionPhase; accepted: boolean; busy: boolean; error: string | null };
type Event =
  | { type: 'initializationStarted' | 'requestStarted' | 'submissionSent' | 'requestFinished' | 'credentialsChanged' | 'forgotten' }
  | { type: 'recovered'; phase: 'ready' | 'pending' | 'uncertain' | 'ended'; accepted: boolean }
  | { type: 'statusReceived'; status: DeletionStatus }
  | { type: 'accessEnded'; accepted?: boolean }
  | { type: 'initializationFailed' | 'sendPrevented' | 'statusUnavailable' };

function deletionReducer(state: State, event: Event): State {
  switch (event.type) {
    case 'initializationStarted': return { ...state, phase: 'loading', error: null };
    case 'initializationFailed': return { ...state, phase: 'storage-error', error: 'Deletion recovery could not be read. Retry before continuing.' };
    case 'recovered': return { ...state, phase: event.phase, accepted: event.accepted };
    case 'requestStarted': return { ...state, busy: true, error: null };
    case 'submissionSent': return { ...state, phase: 'submitting' };
    case 'sendPrevented': return { ...state, error: 'This device could not remember the request. No deletion request was sent.' };
    case 'statusReceived': return { ...state, phase: event.status === 'completed' ? 'completed' : 'pending', accepted: true };
    case 'statusUnavailable': return { ...state, phase: state.accepted ? 'pending' : 'uncertain', error: 'We could not confirm the current deletion status. Check status or retry the same request.' };
    case 'accessEnded': return { ...state, phase: 'ended', accepted: event.accepted ?? state.accepted, error: null };
    case 'requestFinished': return { ...state, busy: false };
    case 'credentialsChanged': return { ...state, busy: false, error: null };
    case 'forgotten': return { phase: 'ready', accepted: false, busy: false, error: null };
  }
}
type Dependencies = {
  read(): Promise<DeletionIntent | null>;
  write(intent: DeletionIntent | null): Promise<void>;
  cleanup(): Promise<void>;
  gate(userId: string): void;
  client(binding: AccountBinding): { submit(): Promise<DeletionStatus>; check(): Promise<DeletionStatus> };
};
const same = (a: AccountBinding | null, b: AccountBinding | null) => a?.userId === b?.userId && a?.sessionId === b?.sessionId;

/** Account lifetime owner, independent of navigation, Space and financial generations. */
export function createDeletionWorkflow(deps: Dependencies) {
  let state: State = { phase: 'loading', accepted: false, busy: false, error: null };
  let binding: AccountBinding | null = null;
  let intent: DeletionIntent | null = null;
  let version = 0;
  let initialized = false;
  const listeners = new Set<() => void>();
  const dispatch = (event: Event) => { state = deletionReducer(state, event); for (const listener of listeners) listener(); };
  function restore() {
    if (!intent) { dispatch({ type: 'recovered', phase: 'ready', accepted: false }); return; }
    if (binding?.userId === intent.userId) {
      deps.gate(intent.userId);
      dispatch({ type: 'recovered', phase: same(binding, intent) ? intent.phase === 'accepted' ? 'pending' : 'uncertain' : 'ended', accepted: intent.phase === 'accepted' });
      void deps.cleanup().catch(() => {});
    } else if (!binding) {
      deps.gate(intent.userId);
      dispatch({ type: 'recovered', phase: 'ended', accepted: intent.phase === 'accepted' });
      void deps.cleanup().catch(() => {});
    }
    else dispatch({ type: 'recovered', phase: 'ready', accepted: false });
  }
  async function initialize() {
    dispatch({ type: 'initializationStarted' });
    try { intent = await deps.read(); initialized = true; restore(); }
    catch { dispatch({ type: 'initializationFailed' }); }
  }
  async function run(submit: boolean) {
    if (!binding || state.busy || !initialized || state.phase === 'storage-error' || state.phase === 'ended' || state.phase === 'completed') return;
    const owner = { ...binding };
    const request = version;
    const current = () => request === version && same(binding, owner);
    dispatch({ type: 'requestStarted' });
    try {
      if (submit) {
        const marker: DeletionIntent = { ...owner, phase: intent?.userId === owner.userId && intent.phase === 'accepted' ? 'accepted' : 'submitted' };
        try { await deps.write(marker); } catch {
          if (current()) dispatch({ type: 'sendPrevented' });
          return;
        }
        intent = marker;
        if (!current()) return;
        deps.gate(owner.userId);
        dispatch({ type: 'submissionSent' });
      }
      const result = await deps.client(owner)[submit ? 'submit' : 'check']();
      if (!current()) return;
      intent = { ...owner, phase: 'accepted' };
      deps.gate(owner.userId);
      // Keep the submitted marker if the acceptance write fails; it still gates restart.
      try { await deps.write(intent); } catch { /* Recovery remains conservative. */ }
      if (!current()) return;
      dispatch({ type: 'statusReceived', status: result });
      await deps.cleanup().catch(() => {}); // The independent session cleanup gate owns retries.
    } catch (error) {
      if (!current()) return;
      if (error instanceof ExpenseApiError && (error.code === 'ACCOUNT_DELETION_PENDING' || error.code === 'ACCOUNT_DELETED')) {
        intent = { ...owner, phase: 'accepted' };
        deps.gate(owner.userId);
        dispatch({ type: 'accessEnded', accepted: true });
        try { await deps.write(intent); } catch { /* Keep the submitted recovery fence. */ }
        if (current()) await deps.cleanup().catch(() => {});
      } else if (error instanceof ExpenseApiError && error.status === 401) {
        dispatch({ type: 'accessEnded' });
        await deps.cleanup().catch(() => {});
      } else {
        dispatch({ type: 'statusUnavailable' });
      }
    } finally { if (current()) dispatch({ type: 'requestFinished' }); }
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize,
    observe(next: AccountBinding | null) {
      if (same(binding, next)) return;
      binding = next; version++; dispatch({ type: 'credentialsChanged' });
      if (initialized) restore();
    },
    submit: () => run(true),
    check: () => run(false),
    async signalDeleted(owner: AccountBinding) {
      if (!same(binding, owner)) return;
      intent = { ...owner, phase: 'accepted' };
      deps.gate(owner.userId);
      dispatch({ type: 'statusReceived', status: 'pending' });
      // Cleanup is mandatory even if the marker cannot be saved.
      try { await deps.write(intent); } finally { await deps.cleanup(); }
    },
    async forget() {
      version++; binding = null;
      await deps.write(null); intent = null;
      dispatch({ type: 'forgotten' });
    },
  };
}
