import { useMemo, useSyncExternalStore } from 'react';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { useAuthorizedClient } from '@/application/authorized-client';
import { session, useSessionSnapshot } from '@/application/session-runtime';
import { useSpaces } from '@/application/spaces/provider';
import { noteManualExpenseSaved } from './browse-state';
import { todayInManila } from './manual-draft';
import { createManualExpenseWorkflow } from './manual-workflow';
import { useSpaceCategories } from './use-space-categories';

export function useManualExpense() {
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  useSessionSnapshot();
  const categories = useSpaceCategories(active?.id ?? null);
  const workflow = useMemo(() => createManualExpenseWorkflow(
    session,
    (spaceId, input) => createExpenseApiClient(authorized).createManualExpense(spaceId, input),
    () => todayInManila(new Date()),
  ), [authorized]);
  const state = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot);
  const draft = workflow.draft();
  const activeCategories = categories.categories.filter((category) => category.isActive);
  return {
    active, categories, draft, issues: state.issues, saving: state.saving, saveError: state.error,
    activeCategories, selected: activeCategories.find((category) => category.id === draft.categoryId) ?? null,
    update: workflow.update,
    async save() {
      if (active?.accessLevel !== 'write') return false;
      const result = await workflow.submit(activeCategories.map((category) => category.id));
      if (result !== 'saved' || !authorized.isCurrent()) return false;
      noteManualExpenseSaved();
      return true;
    },
  };
}
