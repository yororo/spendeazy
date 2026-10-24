import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createCategoriesApiClient, type SpaceCategory } from '@/api/categories-api-client';
import { useAuthorizedClient } from '@/application/authorized-client';
import { createSessionResource } from '@/application/session-resource';
import { session } from '@/application/session-runtime';

export function useSpaceCategories(spaceId: string | null) {
  const authorized = useAuthorizedClient();
  const [requestId, setRequestId] = useState(0);
  const resource = useMemo(() => createSessionResource<SpaceCategory[]>(session, authorized.scope, spaceId ?? ''), [authorized.scope, spaceId]);
  const state = useSyncExternalStore(resource.subscribe, resource.snapshot, resource.snapshot);
  useEffect(() => {
    if (spaceId) void resource.load(() => createCategoriesApiClient(authorized).listCategories(spaceId));
    return resource.cancel;
  }, [authorized, requestId, resource, spaceId]);
  return {
    categories: state.data ?? [],
    loading: Boolean(spaceId) && state.data === null && state.error === null,
    error: state.error,
    reload: () => setRequestId((id) => id + 1),
  };
}
