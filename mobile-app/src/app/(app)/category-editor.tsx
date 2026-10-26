import { useLocalSearchParams, useRouter } from 'expo-router';
import { CategoryConfigurationView } from '@/features/categories/category-configuration-view';
import { useCategoryConfiguration } from '@/features/categories/use-category-configuration';

export default function CategoryEditorScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[]; categoryId?: string | string[] }>();
  const router = useRouter();
  const spaceId = typeof params.spaceId === 'string' ? params.spaceId : null;
  const categoryId = typeof params.categoryId === 'string' ? params.categoryId : null;
  const controller = useCategoryConfiguration(spaceId, categoryId);
  return (
    <CategoryConfigurationView
      state={controller.state}
      onChange={controller.update}
      onAddRule={controller.addRule}
      onRemoveRule={controller.removeRule}
      onSave={() => { void controller.save().then((saved) => { if (saved) router.back(); }); }}
      onRetry={controller.retry}
      onContinueWithDraft={controller.continueWithDraft}
      onUseLatestConfiguration={controller.useLatestConfiguration}
      onBack={() => router.back()}
    />
  );
}
