import { useMemo, useSyncExternalStore } from 'react';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { useAuthorizedClient } from '@/application/authorized-client';
import { session, useSessionSnapshot } from '@/application/session-runtime';
import { useSpaces } from '@/application/spaces/provider';
import { noteManualExpenseSaved } from './browse-state';
import { createManualExpenseWorkflow } from './manual-workflow';
import type { ManualExpenseFormState } from './manual-view';
import { useSpaceCategories } from './use-space-categories';

export function useManualExpense() {
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  useSessionSnapshot();
  const categories = useSpaceCategories(active?.id ?? null);
  const workflow = useMemo(() => createManualExpenseWorkflow(
    session,
    (spaceId, input) => createExpenseApiClient(authorized).createManualExpense(spaceId, input),
    () => new Date(),
  ), [authorized]);
  const state = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot);
  const draft = workflow.draft();
  const activeCategories = categories.categories.filter((category) => category.isActive);
  const canSave = active?.accessLevel === 'write' && active.id === authorized.scope.spaceId &&
    state.phase === 'ready' && !categories.loading && !categories.error && activeCategories.length > 0;
  const form: ManualExpenseFormState = {
    availability: !active ? 'missing-space' : active.accessLevel === 'write' ? 'editable' : 'read-only',
    draft, issues: state.issues, saving: state.phase === 'saving', canSave,
    saveError: state.error,
    categories: { items: activeCategories, loading: categories.loading, error: categories.error },
    selectedCategoryName: activeCategories.find((category) => category.id === draft.categoryId)?.name ?? null,
  };
  return {
    state: form,
    update: workflow.update,
    retryCategories: categories.reload,
    isCurrent: authorized.isCurrent,
    async save() {
      if (!canSave || !active) return false;
      const result = await workflow.submit({ spaceId: active.id, items: categories.categories });
      if (result !== 'saved' || !authorized.isCurrent()) return false;
      noteManualExpenseSaved();
      return true;
    },
  };
}
