import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { type ListedExpense } from '@/api/expense-response';
import { useAuthorizedClient } from '@/application/authorized-client';
import { createSessionResource } from '@/application/session-resource';
import { session } from '@/application/session-runtime';
import { useSpaces } from '@/application/spaces/provider';
import { useSpaceCategories } from './use-space-categories';

export function useExpenseDetail(expenseId: string) {
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  const categories = useSpaceCategories(active?.id ?? null);
  const [requestId, setRequestId] = useState(0);
  const spaceId = active?.id ?? null;
  const resource = useMemo(() => createSessionResource<ListedExpense>(session, authorized.scope, `${spaceId}:${expenseId}`), [authorized.scope, spaceId, expenseId]);
  const state = useSyncExternalStore(resource.subscribe, resource.snapshot, resource.snapshot);
  useEffect(() => {
    if (spaceId) void resource.load(() => createExpenseApiClient(authorized).getExpense(spaceId, expenseId));
    return resource.cancel;
  }, [authorized, expenseId, requestId, resource, spaceId]);
  const expense = state.data;
  return {
    expense, error: state.error,
    phase: !active || (expense === null && state.error === null) ? 'loading' : state.error ? 'error' : 'ready',
    category: categories.categories.find((item) => item.id === expense?.categoryId),
    addedBy: active?.members.find((member) => member.id === expense?.addedByUserId),
    retry: () => setRequestId((id) => id + 1),
  };
}
