import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { useAuthorizedClient } from '@/application/authorized-client';
import { useSpaces } from '@/application/spaces/provider';
import type { ExpenseDetailViewState } from './detail-view';
import { createExpenseDetailWorkflow } from './detail-workflow';
import { useSpaceCategories } from './use-space-categories';

export function useExpenseDetail(expenseId: string) {
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  const spaceId = active?.id ?? null;
  const categories = useSpaceCategories(spaceId);
  const workflow = useMemo(() => createExpenseDetailWorkflow(
    { spaceId: spaceId ?? '', expenseId },
    () => authorized.isCurrent() && spaceId !== null && authorized.scope.spaceId === spaceId,
    (space, id) => createExpenseApiClient(authorized).getExpense(space, id),
  ), [authorized, expenseId, spaceId]);
  const loaded = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot);
  useEffect(() => {
    if (!spaceId) return;
    void workflow.load();
    return workflow.cancel;
  }, [spaceId, workflow]);
  const expense = loaded.phase === 'ready' ? loaded.expense : null;
  const category = categories.categories.find((item) => item.id === expense?.categoryId);
  const addedBy = active?.members.find((member) => member.id === expense?.addedByUserId);
  const state: ExpenseDetailViewState = {
    phase: !spaceId || loaded.phase === 'loading' ? 'loading' : loaded.phase,
    error: loaded.phase === 'error' ? loaded.error : null,
    expense: expense ? {
      description: expense.description,
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      categoryName: category?.name ?? 'Category',
      source: expense.source,
      addedByName: addedBy?.name ?? null,
    } : null,
  };
  return { state, load: workflow.load, retry: workflow.retry };
}
