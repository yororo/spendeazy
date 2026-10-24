import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { readExpensePage, type ExpensePagePayload } from '@/api/expense-response';
import { useAuthorizedClient } from '@/application/authorized-client';
import { createSessionResource } from '@/application/session-resource';
import { session } from '@/application/session-runtime';
import { useSpaces } from '@/application/spaces/provider';
import { useSpaceCategories } from './use-space-categories';
import { applyExpensePage, emptyExpenseBrowse, ensureExpenseBrowse, expenseBrowseIssues,
  expenseBrowseSnapshot, expenseListQuery, readExpenseScroll, rememberExpenseScroll,
  subscribeExpenseBrowse, updateExpenseBrowse, type ExpenseBrowseSelection } from './browse-state';

export function useExpenseBrowse() {
  const { active, refresh: refreshSpaces, loading: spacesLoading, refreshing: spacesRefreshing } = useSpaces();
  const authorized = useAuthorizedClient();
  const browse = useSyncExternalStore(subscribeExpenseBrowse, expenseBrowseSnapshot, expenseBrowseSnapshot);
  const spaceId = active?.id ?? null;
  const selection = spaceId === null ? null : browse.selection?.spaceId === spaceId ? browse.selection : emptyExpenseBrowse(spaceId);
  const categories = useSpaceCategories(spaceId);
  const issues = selection ? expenseBrowseIssues(selection) : [];
  const queryKey = selection ? JSON.stringify(expenseListQuery(selection)) : '';
  const resource = useMemo(() => createSessionResource<ExpensePagePayload>(session, authorized.scope, `${spaceId}:${queryKey}:${browse.listRevision}`), [authorized.scope, spaceId, queryKey, browse.listRevision]);
  const state = useSyncExternalStore(resource.subscribe, resource.snapshot, resource.snapshot);
  useEffect(() => {
    if (!spaceId) return;
    const current = ensureExpenseBrowse(spaceId);
    if (expenseBrowseIssues(current).length === 0) {
      void resource.load(async () => readExpensePage(await createExpenseApiClient(authorized).listExpenses(spaceId, expenseListQuery(current))));
    }
    return resource.cancel;
  }, [authorized, browse.listRevision, queryKey, resource, spaceId]);
  const loaded = issues.length === 0 ? state.data : null;
  return {
    spaceId, selection, categories, issues, queryKey, loaded, error: state.error,
    phase: issues.length > 0 ? 'ready' : !loaded && !state.error ? 'loading' : state.error && !loaded ? 'error' : 'ready',
    refreshing: state.loading && !state.appending, loadingMore: state.appending, spacesLoading, spacesRefreshing,
    refreshSpaces,
    updateSelection(patch: Partial<Omit<ExpenseBrowseSelection, 'spaceId'>>) {
      if (spaceId && authorized.isCurrent()) updateExpenseBrowse(spaceId, patch);
    },
    readScroll: readExpenseScroll,
    rememberScroll(offset: number) { if (authorized.isCurrent()) rememberExpenseScroll(offset); },
    async reload() {
      if (!spaceId || !selection || issues.length) return;
      const success = await resource.load(async () => readExpensePage(await createExpenseApiClient(authorized).listExpenses(spaceId, expenseListQuery(selection))));
      if (success) rememberExpenseScroll(0);
    },
    async loadMore() {
      if (!spaceId || !selection || !loaded?.nextCursor) return;
      await resource.load(async () => readExpensePage(await createExpenseApiClient(authorized).listExpenses(spaceId, expenseListQuery(selection, loaded.nextCursor!))), applyExpensePage);
    },
  };
}
