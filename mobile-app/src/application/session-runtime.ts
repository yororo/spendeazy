import { useSyncExternalStore } from 'react';
import { clearExpenseBrowse, noteManualExpenseSaved } from '@/features/expenses/browse-state';
import { createSession } from './session';

export const session = createSession(clearExpenseBrowse, noteManualExpenseSaved);
export const statementImportStore = session.imports;
export const observeAuthUser = session.observeIdentity;
export const dismissRecoveryAnnouncement = session.dismissRecovery;

export function useSessionSnapshot() {
  return useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
}
