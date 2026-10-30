import { useSyncExternalStore } from 'react';
import { clearExpenseBrowse, noteManualExpenseSaved } from '@/features/expenses/browse-state';
import { createSession } from './session';
import * as SecureStore from 'expo-secure-store';
import { createReceiptOwner } from '@/features/statement-import/confirmation-receipt';

export const confirmationReceipts = createReceiptOwner(SecureStore);
export const session = createSession(clearExpenseBrowse, noteManualExpenseSaved, confirmationReceipts);
export const statementImportStore = session.imports;
export const observeAuthUser = session.observeIdentity;
export const dismissRecoveryAnnouncement = session.dismissRecovery;

export function useSessionSnapshot() {
  return useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
}
