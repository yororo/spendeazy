import { useSyncExternalStore } from 'react';
import { clearExpenseBrowse, noteManualExpenseSaved } from '@/features/expenses/browse-state';
import { createSession } from './session';
import * as SecureStore from 'expo-secure-store';
import { createReceiptOwner } from '@/features/statement-import/confirmation-receipt';
import { cleanupProfileImages } from '@/features/profile/native-profile-image';
import { clearRememberedSpaces } from '@/navigation/device-memory';
import { sweepImportFiles } from '@/features/statement-import/native-file';

const resourceCleanups = new Set<() => Promise<void>>();
export function registerPrivateCleanup(cleanup: () => Promise<void>) { resourceCleanups.add(cleanup); }
let lastOwner: string | null = null;

export const confirmationReceipts = createReceiptOwner(SecureStore);
export const session = createSession(clearExpenseBrowse, noteManualExpenseSaved, confirmationReceipts, async () => {
  const results = await Promise.allSettled([
    clearRememberedSpaces(lastOwner), cleanupProfileImages(),
    ...Array.from(resourceCleanups, cleanup => cleanup()),
  ]);
  // A late picker/copy must settle before the final sweep.
  const sweep = await Promise.allSettled([Promise.resolve().then(sweepImportFiles)]);
  if ([...results, ...sweep].some(result => result.status === 'rejected')) throw new Error('Private cleanup failed');
});
session.subscribe(() => { lastOwner = session.snapshot().ownerUserId ?? lastOwner; });
export const statementImportStore = session.imports;
export const observeAuthUser = session.observeIdentity;
export const dismissRecoveryAnnouncement = session.dismissRecovery;

export function useSessionSnapshot() {
  return useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
}
