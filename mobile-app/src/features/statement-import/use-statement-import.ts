import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { session, statementImportStore } from '@/application/session-runtime';
import { useSpaces } from '@/application/spaces/provider';
import { spaceIdentityLabel } from '@/application/spaces/active-space';
import { importWorkflow, unlockImport } from './import-runtime';

export function useStatementImport() {
  const state = useSyncExternalStore(statementImportStore.subscribe, statementImportStore.snapshot, statementImportStore.snapshot);
  const runtime = useSyncExternalStore(importWorkflow.subscribe, importWorkflow.snapshot, importWorkflow.snapshot);
  const { active } = useSpaces();
  const scope = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const writable = !!active && active.accessLevel === 'write' && active.status === 'active' && scope.spaceWritable;
  return {
    state, cleanup: runtime.cleanup, readOnly: !writable,
    destination: active ? spaceIdentityLabel(active) : 'Destination Space unavailable',
    canSelect: writable && runtime.cleanup === 'ready' && (state.phase === 'idle' || state.phase === 'failed' || (state.phase === 'suspended' && !state.result)),
    select() {
      if (!writable || !scope.userId || !scope.spaceId) return;
      void importWorkflow.select(Crypto.randomUUID(), { id: Crypto.randomUUID(), generation: scope.generation, owner: { userId: scope.userId, spaceId: scope.spaceId } });
    },
    cancel: importWorkflow.cancel, discard: importWorkflow.discard,
    retryCleanup: () => { void importWorkflow.recover(); },
    unlock: unlockImport,
  };
}
