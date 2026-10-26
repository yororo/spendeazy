import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createCategoriesApiClient } from '@/api/categories-api-client';
import { useAuthorizedClient } from '@/application/authorized-client';
import { createSessionResource } from '@/application/session-resource';
import { session } from '@/application/session-runtime';
import { loadBudgetCategories } from './budget-category-loader';
import type { SpaceBudgetCategory } from './budget-category-loader';

export function useBudgetCategories(spaceId: string | null) {
  const authorized = useAuthorizedClient();
  const [requestId, setRequestId] = useState(0);
  const resource = useMemo(
    () => createSessionResource<SpaceBudgetCategory[]>(session, authorized.scope, spaceId ?? ''),
    [authorized.scope, spaceId],
  );
  const state = useSyncExternalStore(resource.subscribe, resource.snapshot, resource.snapshot);
  const reload = useCallback(() => setRequestId((id) => id + 1), []);

  useEffect(() => {
    if (spaceId) {
      const client = createCategoriesApiClient(authorized);
      void resource.load(() => loadBudgetCategories(spaceId, client));
    }
    return resource.cancel;
  }, [authorized, requestId, resource, spaceId]);

  return {
    categories: state.data ?? [],
    loading: Boolean(spaceId) && state.data === null && state.error === null,
    refreshing: state.data !== null && state.loading,
    error: state.error,
    reload,
  };
}
