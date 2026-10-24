import { useSyncExternalStore } from 'react';

import {
  applyAuthTransition,
  shouldAnnounceRecovery,
} from '@/navigation/session-transition';
import { clearExpenseBrowse } from '@/navigation/expense-browse';
import {
  clearFinancialSelection,
  type PrivateSession,
} from '@/navigation/private-session';

type SessionSnapshot = {
  held: PrivateSession | null;
  notice: 'expired' | null;
  userId: string | null;
  announceRecovery: boolean;
};

let snapshot: SessionSnapshot = {
  held: null,
  notice: null,
  userId: null,
  announceRecovery: false,
};
let explicitSignOut = false;
const listeners = new Set<() => void>();

export function markExplicitSignOut(): void {
  explicitSignOut = true;
}

export function observeAuthUser(nextUserId: string | null): void {
  const explicit = explicitSignOut;
  explicitSignOut = false;
  if (nextUserId === snapshot.userId && !explicit) return;

  const result = applyAuthTransition({
    previousUserId: snapshot.userId,
    nextUserId,
    explicitSignOut: explicit,
    held: snapshot.held,
  });
  const announceRecovery = shouldAnnounceRecovery(snapshot.notice, snapshot.held, result.held);
  snapshot = {
    held: result.held,
    notice: result.notice,
    userId: nextUserId,
    announceRecovery,
  };
  emit();
}

export function dismissRecoveryAnnouncement(): void {
  if (!snapshot.announceRecovery) return;
  snapshot = { ...snapshot, announceRecovery: false };
  emit();
}

export function clearActiveFinancialSelection(): void {
  clearExpenseBrowse();
  if (!snapshot.held) return;
  snapshot = { ...snapshot, held: clearFinancialSelection(snapshot.held) };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function useSessionSnapshot(): SessionSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
