import { Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import type { SpaceCategory } from '@/api/categories-api-client';
import { radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { CategoryIconMark } from './category-configuration-view';

export function CategoryListView({
  categories,
  loading,
  error,
  canEdit,
  spaceStatus,
  onRetry,
  onCreate,
  onOpen,
}: {
  categories: readonly SpaceCategory[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  spaceStatus: ReactNode;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (categoryId: string) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const active = categories.filter((category) => category.isActive);
  const inactive = categories.filter((category) => !category.isActive);

  const sectionTitle = (label: string) => (
    <Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle }}>{label}</Text>
  );

  function renderCategoryRow(category: SpaceCategory) {
    return (
      <Pressable
        key={category.id}
        accessibilityRole="button"
        accessibilityLabel={`${canEdit ? 'Edit' : 'View'} ${category.name}${category.isActive ? '' : ', inactive'}`}
        onPress={() => onOpen(category.id)}
        style={{
          minHeight: 70,
          borderWidth: 1,
          borderColor: palette.fieldBorder,
          borderRadius: radius.control,
          backgroundColor: palette.surfaceModal,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
        }}>
        <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.body }}>{category.name}</Text>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.sectionTitle }}>
            {category.isActive ? 'Active' : 'Inactive · History and configuration kept'}
          </Text>
        </View>
        <Text style={{ color: palette.brandPrimary, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle }}>{canEdit ? 'Edit' : 'View'}</Text>
      </Pressable>
    );
  }

  return (
    <Screen title="Budget" refreshing={loading} onRefresh={onRetry}>
      <StackGap>
        {spaceStatus}
        <BodyText>Manage Categories, optional Budgets and matching Rules together.</BodyText>
        {canEdit ? <PrimaryButton label="Create Category" onPress={onCreate} /> : null}
        {error ? (
          <StackGap>
            <BodyText>{error}</BodyText>
            <SecondaryButton label="Try again" onPress={onRetry} />
          </StackGap>
        ) : null}
        {loading && !error ? <SupportingText>Loading Categories.</SupportingText> : null}
        {!loading && !error && categories.length === 0 ? (
          <SupportingText>No Categories yet. Create one to start organizing Expenses.</SupportingText>
        ) : null}
        {active.length ? (
          <View style={{ gap: space.cardGap }}>
            {sectionTitle('Active Categories')}
            {active.map(renderCategoryRow)}
          </View>
        ) : null}
        {inactive.length ? (
          <View style={{ gap: space.cardGap }}>
            {sectionTitle('Inactive Categories')}
            {inactive.map(renderCategoryRow)}
          </View>
        ) : null}
      </StackGap>
    </Screen>
  );

}
