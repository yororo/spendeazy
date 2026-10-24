import type { ManualExpenseDraft } from '../features/expenses/manual-draft.ts';

export type SessionScope = { generation: number; userId: string | null; spaceId: string | null };
type SessionSnapshot = {
  userId: string | null;
  authSessionId: string | null;
  ownerUserId: string | null;
  spaceId: string | null;
  draft: ManualExpenseDraft | null;
  notice: 'expired' | null;
  announceRecovery: boolean;
  generation: number;
};

/** Owns private-work retention and invalidates all work started in an older session/Space. */
export function createSession(onResetSelections: () => void = () => {}) {
  let state: SessionSnapshot = {
    userId: null, authSessionId: null, ownerUserId: null, spaceId: null, draft: null,
    notice: null, announceRecovery: false, generation: 0,
  };
  const listeners = new Set<() => void>();
  function publish(patch: Partial<SessionSnapshot>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  function isCurrent(scope: SessionScope) {
    return state.notice === null && state.userId !== null && scope.userId === state.userId &&
      scope.spaceId === state.spaceId && scope.generation === state.generation;
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    capture: (): SessionScope => ({ generation: state.generation, userId: state.userId, spaceId: state.spaceId }),
    isCurrent,
    observeIdentity(userId: string | null, authSessionId: string | null = null) {
      if (state.userId === userId && state.authSessionId === authSessionId) return;
      if (userId === null) {
        publish({ userId: null, authSessionId: null, notice: state.ownerUserId ? 'expired' : null, generation: state.generation + 1 });
        return;
      }
      const sameOwner = state.ownerUserId === userId;
      if (!sameOwner) onResetSelections();
      publish({
        userId, authSessionId, ownerUserId: userId, notice: null,
        spaceId: sameOwner ? state.spaceId : null,
        draft: sameOwner ? state.draft : null,
        announceRecovery: sameOwner && state.notice === 'expired' && state.draft !== null,
        generation: state.generation + 1,
      });
    },
    expire(scope: SessionScope) {
      if (!isCurrent(scope) || state.notice === 'expired') return false;
      publish({ notice: 'expired', generation: state.generation + 1 });
      return true;
    },
    signOut() {
      onResetSelections();
      publish({ userId: null, authSessionId: null, ownerUserId: null, spaceId: null, draft: null,
        notice: null, announceRecovery: false, generation: state.generation + 1 });
    },
    changeSpace(spaceId: string | null) {
      if (state.spaceId === spaceId) return;
      onResetSelections();
      publish({ spaceId, draft: state.draft ? { ...state.draft, categoryId: null } : null,
        generation: state.generation + 1 });
    },
    saveDraft(draft: ManualExpenseDraft | null) {
      if (!state.userId || state.notice === 'expired') return;
      publish({ draft });
    },
    dismissRecovery() { publish({ announceRecovery: false }); },
  };
}

export type Session = ReturnType<typeof createSession>;
