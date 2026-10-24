import { useEffect, useState } from 'react';

import { ExpenseApiError, ExpenseApiTransportError } from '@/api/authorized-request';
import {
  createCategoriesApiClient,
  type SpaceCategory,
} from '@/api/categories-api-client';
import { useAuthorizedClient } from '@/navigation/authorized-client';

export function useSpaceCategories(spaceId: string | null): {
  categories: SpaceCategory[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const authorized = useAuthorizedClient();
  const [requestId, setRequestId] = useState(0);
  const [result, setResult] = useState<{
    spaceId: string;
    requestId: number;
    categories: SpaceCategory[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    let current = true;
    createCategoriesApiClient(authorized)
      .listCategories(spaceId)
      .then((next) => {
        if (!current) return;
        setResult({ spaceId, requestId, categories: next, error: null });
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setResult({
          spaceId,
          requestId,
          categories: [],
          error: categoryLoadMessage(cause),
        });
      });
    return () => {
      current = false;
    };
  }, [authorized, requestId, spaceId]);

  const current = result?.spaceId === spaceId && result.requestId === requestId ? result : null;
  return {
    categories: current?.categories ?? [],
    loading: Boolean(spaceId) && current === null,
    error: current?.error ?? null,
    reload: () => setRequestId((id) => id + 1),
  };
}

function categoryLoadMessage(cause: unknown): string {
  if (cause instanceof ExpenseApiError || cause instanceof ExpenseApiTransportError) {
    return cause.message;
  }
  if (cause instanceof Error && cause.message.startsWith('Categories response')) {
    return 'Categories could not be read. Try again.';
  }
  return 'Categories could not be loaded. Try again.';
}
