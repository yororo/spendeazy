import type { ManualExpenseDraft } from '../features/expenses/manual-draft.ts';
import { createImportStore } from '../features/statement-import/import-store.ts';
import { createConfirmationWorkflow } from '../features/statement-import/confirmation-workflow.ts';
import type { ReceiptOwner } from '../features/statement-import/confirmation-receipt.ts';

export type SessionScope = { generation: number; userId: string | null; spaceId: string | null };
type SessionSnapshot = {
  userId: string | null;
  authSessionId: string | null;
  ownerUserId: string | null;
  spaceId: string | null;
  spaceWritable: boolean;
  draft: ManualExpenseDraft | null;
  notice: 'expired' | null;
  announceRecovery: boolean;
  generation: number;
  cleanupPending: boolean;
  cleanupError: boolean;
};

/** Owns private-work retention and invalidates all work started in an older session/Space. */
export function createSession(onResetSelections: () => void = () => {}, onImportSaved: () => void = onResetSelections, receipts?: ReceiptOwner, cleanupResources?: () => Promise<void>) {
  const fencedIdentities = new Set<string>();
  const endedCredentials = new Set<string>();
  const hasPrivateStorage = receipts !== undefined || cleanupResources !== undefined;
  let state: SessionSnapshot = {
    userId: null, authSessionId: null, ownerUserId: null, spaceId: null, spaceWritable: false, draft: null,
    notice: null, announceRecovery: false, generation: 0,
    cleanupPending: false, cleanupError: false,
  };
  const listeners = new Set<() => void>();
  const authenticated = () => state.userId !== null && !fencedIdentities.has(state.userId) && state.notice === null && !state.cleanupPending && !state.cleanupError;
  const imports = createImportStore(() => ({
    ...state, authenticated: authenticated(), writable: state.spaceWritable && !confirmation.hasReceipt(),
  }));
  const confirmation = createConfirmationWorkflow({
    access: () => ({ ...state, authenticated: authenticated(), writable: state.spaceWritable }),
    handoff: () => { const draft = imports.snapshot(); return draft.phase === 'review-ready' ? draft.review.handoff : null; },
    lock: imports.lockConfirmation,
    complete: imports.completeConfirmation,
    refresh: onImportSaved,
    receipts,
  });
  imports.subscribe(confirmation.synchronize);
  function publish(patch: Partial<SessionSnapshot>) {
    state = { ...state, ...patch };
    imports.synchronize();
    confirmation.synchronize();
    for (const listener of listeners) listener();
  }
  function isCurrent(scope: SessionScope) {
    return authenticated() && scope.userId === state.userId &&
      scope.spaceId === state.spaceId && scope.generation === state.generation;
  }
  let cleanup: Promise<void> = Promise.resolve();
  let cleanupVersion = 0;
  function cleanupPrivateStorage() {
    if (!receipts && !cleanupResources) return Promise.resolve();
    const request = ++cleanupVersion;
    publish({ cleanupPending: true, cleanupError: false });
    cleanup = cleanup.catch(() => {}).then(async () => {
      // Run every cleanup even if an independent resource fails.
      const outcomes = await Promise.allSettled([receipts?.cleanup(), cleanupResources?.()]);
      if (outcomes.some(outcome => outcome.status === 'rejected')) throw new Error('Private cleanup failed');
    }).then(() => { if (request === cleanupVersion) publish({ cleanupPending: false }); }, error => {
      if (request === cleanupVersion) publish({ cleanupPending: false, cleanupError: true }); throw error;
    });
    // Observe automatic identity cleanup failures; the retry surface retains them.
    void cleanup.catch(() => {});
    return cleanup;
  }
  function clearPrivateIdentity() {
    onResetSelections();
    publish({ userId: null, authSessionId: null, ownerUserId: null, spaceId: null, spaceWritable: false, draft: null,
      notice: null, announceRecovery: false, cleanupPending: hasPrivateStorage, generation: state.generation + 1 });
    return cleanupPrivateStorage();
  }
  return {
    imports,
    confirmation,
    awaitCleanup: () => cleanup,
    retryCleanup: cleanupPrivateStorage,
    blockIdentity(userId: string) {
      fencedIdentities.add(userId);
      publish({ generation: state.generation + 1 });
    },
    acceptedAccountDeletion() {
      if (state.ownerUserId) fencedIdentities.add(state.ownerUserId);
      return clearPrivateIdentity();
    },
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    capture: (): SessionScope => ({ generation: state.generation, userId: state.userId, spaceId: state.spaceId }),
    isCurrent,
    observeIdentity(userId: string | null, authSessionId: string | null = null) {
      if (userId && fencedIdentities.has(userId)) return;
      if (userId && authSessionId && endedCredentials.has(`${userId}\0${authSessionId}`)) return;
      if (state.userId === userId && state.authSessionId === authSessionId) return;
      if (userId === null) {
        publish({ userId: null, authSessionId: null, notice: state.ownerUserId ? 'expired' : null, generation: state.generation + 1 });
        return;
      }
      const sameOwner = state.ownerUserId === userId;
      const changedOwner = state.ownerUserId !== null && !sameOwner;
      if (!sameOwner) onResetSelections();
      publish({
        userId, authSessionId, ownerUserId: userId, notice: null,
        cleanupPending: state.cleanupPending || (changedOwner && hasPrivateStorage),
        spaceId: sameOwner ? state.spaceId : null,
        spaceWritable: sameOwner ? state.spaceWritable : false,
        draft: sameOwner ? state.draft : null,
        announceRecovery: sameOwner && state.notice === 'expired' && (state.draft !== null || imports.hasWork()),
        generation: state.generation + 1,
      });
      if (changedOwner && hasPrivateStorage) void cleanupPrivateStorage();
    },
    expire(scope: SessionScope) {
      if (!isCurrent(scope) || state.notice === 'expired') return false;
      publish({ notice: 'expired', generation: state.generation + 1 });
      return true;
    },
    resumeVerifiedIdentity(userId: string, authSessionId: string | null) {
      if (state.userId !== userId || state.authSessionId !== authSessionId || fencedIdentities.has(userId)) return;
      publish({ notice: null, announceRecovery: state.draft !== null || imports.hasWork(), generation: state.generation + 1 });
    },
    signOut() {
      if (state.userId && state.authSessionId) endedCredentials.add(`${state.userId}\0${state.authSessionId}`);
      return clearPrivateIdentity();
    },
    changeSpace(spaceId: string | null, writable = true) {
      if (state.cleanupPending || state.cleanupError) return false;
      if (state.spaceId === spaceId) {
        if (state.spaceWritable !== writable) publish({ spaceWritable: writable });
        return true;
      }
      if (imports.hasWork() || (confirmation.hasReceipt() && confirmation.receipt()?.spaceId !== spaceId)) return false;
      onResetSelections();
      publish({ spaceId, spaceWritable: spaceId !== null && writable, draft: state.draft ? { ...state.draft, categoryId: null } : null,
        generation: state.generation + 1 });
      return true;
    },
    saveDraft(draft: ManualExpenseDraft | null) {
      if (!authenticated()) return;
      publish({ draft });
    },
    dismissRecovery() { publish({ announceRecovery: false }); },
  };
}

export type Session = ReturnType<typeof createSession>;
