import { useCallback, useRef } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { SpaceStatus } from '@/components/space-status';
import { useSpaces } from '@/application/spaces/provider';
import { BudgetListView } from '@/features/categories/budget-list-view';
import { useBudgetCategories } from '@/features/categories/use-budget-categories';

export default function BudgetScreen() {
  const router = useRouter();
  const { active } = useSpaces();
  const categories = useBudgetCategories(active?.id ?? null);
  const reloadCategories = categories.reload;
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focused.current) reloadCategories();
    focused.current = true;
  }, [reloadCategories]));
  return (
    <BudgetListView
      key={active?.id ?? 'no-space'}
      categories={categories.categories}
      loading={categories.loading}
      refreshing={categories.refreshing}
      error={categories.error}
      canEdit={active?.status === 'active' && active.accessLevel === 'write'}
      spaceStatus={<SpaceStatus />}
      onRetry={reloadCategories}
      onCreate={() => active && router.push(`/category-editor?spaceId=${encodeURIComponent(active.id)}` as Href)}
      onOpen={(categoryId) => active && router.push(`/category-editor?spaceId=${encodeURIComponent(active.id)}&categoryId=${encodeURIComponent(categoryId)}` as Href)}
    />
  );
}
