import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { session, registerPrivateCleanup } from '@/application/session-runtime';
import { clearRememberedSpaces } from '@/navigation/device-memory';
import { createDeletionWorkflow, type AccountBinding, type DeletionIntent } from './deletion-workflow';
import { createDeletionTransport } from './deletion-transport';

const key = 'account-deletion-intent';
let writes: Promise<void> = Promise.resolve();
let credentials: { binding: AccountBinding | null; token(): Promise<string | null>; current(): boolean } | null = null;
let cleanupOwner: string | null = null;
registerPrivateCleanup(() => clearRememberedSpaces(cleanupOwner));

export function setDeletionCredentials(next: NonNullable<typeof credentials>) {
  credentials = next;
  accountDeletion.observe(next.binding);
}
export const accountDeletion = createDeletionWorkflow({
  async read() {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || !value || !('userId' in value) || typeof value.userId !== 'string' ||
      !('sessionId' in value) || typeof value.sessionId !== 'string' || !('phase' in value) ||
      (value.phase !== 'submitted' && value.phase !== 'accepted')) throw new Error('Invalid deletion intent');
    return value as DeletionIntent;
  },
  write(intent) {
    const write = writes.catch(() => {}).then(() => intent
      ? SecureStore.setItemAsync(key, JSON.stringify(intent))
      : SecureStore.deleteItemAsync(key));
    writes = write;
    return write;
  },
  gate(userId) { cleanupOwner = userId; session.blockIdentity(userId); },
  cleanup: session.acceptedAccountDeletion,
  client(binding) {
    const current = () => credentials?.binding?.userId === binding.userId &&
      credentials.binding.sessionId === binding.sessionId && credentials.current();
    return createDeletionTransport(binding, {
      current,
      token: () => credentials!.token(),
    });
  },
});

export function useDeletionSnapshot() {
  return useSyncExternalStore(accountDeletion.subscribe, accountDeletion.snapshot, accountDeletion.snapshot);
}
