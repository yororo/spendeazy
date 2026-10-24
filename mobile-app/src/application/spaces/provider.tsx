import { useAuth } from '@clerk/expo';
import { createContext, use, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createSpacesApiClient } from '@/api/spaces-api-client';
import { readRememberedSpaceId, writeRememberedSpaceId } from '@/navigation/device-memory';
import { session } from '../session-runtime';
import { useSessionTransport } from '../authorized-client';
import { createSpacesWorkflow } from './workflow';
import type { AccessibleSpace } from './active-space';

type SpacesContextValue = ReturnType<ReturnType<typeof createSpacesWorkflow>['snapshot']> & {
  refresh: () => void;
  selectSpace: (space: AccessibleSpace) => Promise<void>;
};
const SpacesContext = createContext<SpacesContextValue | null>(null);

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const transport = useSessionTransport();
  const workflow = useMemo(() => {
    // The route mounts this provider only after the session observes Clerk.
    if (session.snapshot().userId !== userId) throw new Error('Spaces requires the current identity');
    return createSpacesWorkflow(session, {
      list: () => createSpacesApiClient(transport.forScope(session.capture())).listSpaces(),
      read: readRememberedSpaceId,
      write: writeRememberedSpaceId,
    });
  }, [transport, userId]);
  const state = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot);
  useEffect(() => {
    void workflow.load();
    return workflow.cancel;
  }, [workflow]);
  return <SpacesContext value={{ ...state, refresh: () => { void workflow.load(); }, selectSpace: (space) => workflow.select(space.id) }}>{children}</SpacesContext>;
}

export function useSpaces(): SpacesContextValue {
  const value = use(SpacesContext);
  if (!value) throw new Error('useSpaces must be used within SpacesProvider');
  return value;
}
