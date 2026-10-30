import { useAuth } from '@clerk/expo';
import { createContext, useCallback, use, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createSpacesApiClient } from '@/api/spaces-api-client';
import { createUserApiClient } from '@/api/user-api-client';
import { readRememberedSpaceId, writeRememberedSpaceId } from '@/navigation/device-memory';
import { session } from '../session-runtime';
import { useSessionTransport } from '../authorized-client';
import { createSpacesWorkflow } from './workflow';
import type { AccessibleSpace } from './active-space';

type SpacesContextValue = ReturnType<ReturnType<typeof createSpacesWorkflow>['snapshot']> & {
  refresh: () => Promise<void>;
  selectSpace: (space: AccessibleSpace) => Promise<void>;
  selectSpaceId: (spaceId: string) => Promise<void>;
  discardUnsavedExpense: () => void;
  discardUnsavedWork: () => void;
  hasImportWork: boolean;
  hasUnsavedWork: boolean;
};
const SpacesContext = createContext<SpacesContextValue | null>(null);

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const transport = useSessionTransport();
  const workflow = useMemo(() => {
    // The route mounts this provider only after the session observes Clerk.
    if (session.snapshot().userId !== userId) throw new Error('Spaces requires the current identity');
    return createSpacesWorkflow(session, {
      provision: () => createUserApiClient(transport.forScope(session.capture())).provisionUser(),
      list: () => createSpacesApiClient(transport.forScope(session.capture())).listSpaces(),
      read: readRememberedSpaceId,
      write: writeRememberedSpaceId,
    });
  }, [transport, userId]);
  const state = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot);
  const hasExpenseWork = useSyncExternalStore(
    session.subscribe,
    () => session.snapshot().draft !== null,
    () => false,
  );
  const hasImportWork = useSyncExternalStore(session.imports.subscribe, session.imports.hasWork, () => false);
  useEffect(() => {
    void workflow.load();
    return workflow.cancel;
  }, [workflow]);
  const refresh = useCallback(() => workflow.load(), [workflow]);
  return <SpacesContext value={{
    ...state,
    refresh,
    selectSpace: (space) => workflow.select(space.id),
    selectSpaceId: workflow.select,
    discardUnsavedExpense: workflow.discardUnsavedExpense,
    discardUnsavedWork: workflow.discardUnsavedWork,
    hasImportWork,
    hasUnsavedWork: hasExpenseWork || hasImportWork,
  }}>{children}</SpacesContext>;
}

export function useSpaces(): SpacesContextValue {
  const value = use(SpacesContext);
  if (!value) throw new Error('useSpaces must be used within SpacesProvider');
  return value;
}
