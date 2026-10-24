import { useAuth } from '@clerk/expo';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { ExpenseApiError } from '@/api/authorized-request';
import { createSpacesApiClient } from '@/api/spaces-api-client';
import { API_BASE_URL } from '@/config/api';
import { selectActiveSpace, type AccessibleSpace } from '@/navigation/active-space';
import { readRememberedSpaceId, writeRememberedSpaceId } from '@/navigation/device-memory';
import { clearActiveFinancialSelection } from '@/navigation/session-store';

type SpaceResult = {
  userId: string;
  spaces: AccessibleSpace[];
  active: AccessibleSpace | null;
  error: string | null;
};

type SpacesContextValue = {
  spaces: AccessibleSpace[];
  active: AccessibleSpace | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  memoryError: string | null;
  refresh: () => void;
  selectSpace: (space: AccessibleSpace) => Promise<void>;
};

const SpacesContext = createContext<SpacesContextValue | null>(null);

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { getToken, signOut, userId } = useAuth();
  const [result, setResult] = useState<SpaceResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);
  const current = result?.userId === userId ? result : null;

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRequestId((currentId) => currentId + 1);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const signedInUserId = userId;
    let activeRequest = true;

    async function load() {
      try {
        if (!API_BASE_URL) {
          throw new Error('Set EXPO_PUBLIC_API_BASE_URL before loading Spaces.');
        }
        const nextSpaces = await createSpacesApiClient({
          getAccessToken: () => getToken(),
        }).listSpaces();
        if (!activeRequest) return;
        const remembered = await readRememberedSpaceId(signedInUserId);
        const selected = selectActiveSpace(nextSpaces, remembered);
        setResult({
          userId: signedInUserId,
          spaces: nextSpaces,
          active: selected,
          error: null,
        });
        if (selected && selected.id !== remembered) {
          const saved = await writeRememberedSpaceId(signedInUserId, selected.id);
          if (activeRequest) {
            setMemoryError(saved ? null : 'This device could not remember the active Space.');
          }
        }
      } catch (cause) {
        if (!activeRequest) return;
        if (
          cause instanceof ExpenseApiError &&
          cause.status === 401 &&
          cause.code !== 'MISSING_ACCESS_TOKEN'
        ) {
          await signOut();
          return;
        }
        setResult({
          userId: signedInUserId,
          spaces: [],
          active: null,
          error: spaceLoadMessage(cause),
        });
      } finally {
        if (activeRequest) setRefreshing(false);
      }
    }

    void load();
    return () => {
      activeRequest = false;
    };
  }, [getToken, requestId, signOut, userId]);

  async function selectSpace(space: AccessibleSpace) {
    if (!userId || !current || space.id === current.active?.id) return;
    clearActiveFinancialSelection();
    setResult({ ...current, active: space });
    const saved = await writeRememberedSpaceId(userId, space.id);
    setMemoryError(saved ? null : 'This device could not remember the active Space.');
  }

  return (
    <SpacesContext
      value={{
        spaces: current?.spaces ?? [],
        active: current?.active ?? null,
        loading: Boolean(userId) && !current,
        refreshing,
        error: current?.error ?? null,
        memoryError,
        refresh,
        selectSpace,
      }}>
      {children}
    </SpacesContext>
  );
}

export function useSpaces(): SpacesContextValue {
  const value = use(SpacesContext);
  if (!value) throw new Error('useSpaces must be used within SpacesProvider');
  return value;
}

function spaceLoadMessage(cause: unknown): string {
  if (cause instanceof ExpenseApiError) return cause.message;
  if (cause instanceof Error && cause.message.startsWith('Set EXPO_PUBLIC_API_BASE_URL')) {
    return cause.message;
  }
  if (cause instanceof Error && cause.message.startsWith('Could not reach')) return cause.message;
  if (cause instanceof Error && cause.message.startsWith('Spaces response')) {
    return 'Spaces could not be read. Try again.';
  }
  return 'Spaces could not be loaded. Try again.';
}
