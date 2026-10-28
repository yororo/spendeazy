import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DesignSurface } from '@/components/design-surface';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { Screen, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import type { SpaceBudgetCategory } from './budget-category-loader';
import {
  calculateBudgetPlan,
  formatBudgetDetails,
  selectBudgetCategories,
  type BudgetBrowseView,
  type BudgetPeriodFilter,
  type BudgetSortDirection,
  type BudgetSortField,
} from './budget-browse';
import { CategoryIconMark } from '@/components/category-mark';
import { controlSize, radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function BudgetListView({
  categories,
  loading,
  refreshing = false,
  error,
  canEdit,
  spaceStatus,
  onRetry,
  onCreate,
  onOpen,
}: {
  categories: readonly SpaceBudgetCategory[];
  loading: boolean;
  refreshing?: boolean;
  error: string | null;
  canEdit: boolean;
  spaceStatus: ReactNode;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (categoryId: string) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [view, setView] = useState<BudgetBrowseView>('active');
  const [filter, setFilter] = useState<BudgetPeriodFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<BudgetSortField>('name');
  const [direction, setDirection] = useState<BudgetSortDirection>('ascending');
  const plan = useMemo(() => calculateBudgetPlan(categories), [categories]);
  const visibleCategories = useMemo(
    () => selectBudgetCategories(categories, { view, filter, search, sort, direction }),
    [categories, direction, filter, search, sort, view],
  );
  const categoriesInView = categories.filter((category) => category.isActive === (view === 'active'));
  const planAvailable = categories.length > 0 || (!loading && !error);
  const categoryViewLabel = view === 'active' ? 'Active Categories' : 'Inactive Categories';

  const sectionTitle = (label: string) => (
    <Text
      accessibilityRole="header"
      style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle }}>
      {label}
    </Text>
  );

  function renderCategoryRow(category: SpaceBudgetCategory) {
    const details = category.budget ? formatBudgetDetails(category.budget) : null;
    const budgetDescription = details
      ? `Budget ${details.originalAmount} per ${details.originalPeriod}; monthly equivalent ${details.monthlyEquivalent}; annual equivalent ${details.annualEquivalent}`
      : 'No Budget set';
    const actionLabel = !canEdit ? 'View' : category.budget ? 'Edit' : 'Set budget';
    const rowLabel = actionLabel === 'Set budget'
      ? `Set Budget for ${category.name}, ${category.isActive ? 'active' : 'inactive'}, ${budgetDescription}`
      : `${actionLabel} ${category.name}, ${category.isActive ? 'active' : 'inactive'}, ${budgetDescription}`;

    return (
      <Pressable
        key={category.id}
        accessible
        accessibilityRole="button"
        accessibilityLabel={rowLabel}
        accessibilityHint={canEdit ? 'Opens Category and Budget settings' : 'Opens Category details'}
        onPress={() => onOpen(category.id)}
        style={{
          minHeight: 76,
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
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text
            style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.body }}>
            {category.name}
          </Text>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.medium, fontSize: typeScale.metadata }}>
            {category.isActive ? 'Active' : 'Inactive'}
          </Text>
          {details ? (
            <>
              <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: typeScale.body }}>
                {details.originalAmount} per {details.originalPeriod}
              </Text>
              <Text
                style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata }}>
                Monthly equivalent {details.monthlyEquivalent} · Annual equivalent {details.annualEquivalent}
              </Text>
            </>
          ) : (
            <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              No Budget set
            </Text>
          )}
        </View>
        <Text style={{ color: palette.brandPrimary, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle }}>
          {actionLabel}
        </Text>
      </Pressable>
    );
  }

  return (
    <Screen title="Budget" refreshing={loading || refreshing} onRefresh={onRetry}>
      <View style={{ gap: space.cardGap }}>
        {spaceStatus}
        {canEdit ? <PrimaryButton label="Create Category" onPress={onCreate} /> : null}

        <DesignSurface
          accessibilityLabel={planAvailable
            ? `Monthly-equivalent plan ${plan.monthlyEquivalent}; annual equivalent ${plan.annualEquivalent}; ${plan.budgetCount} active ${plan.budgetCount === 1 ? 'Budget' : 'Budgets'}`
            : 'Budget plan loading'}
          style={{ gap: space.cardGap, padding: space.cardInset }}>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle }}>
            Monthly-equivalent plan
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.summaryMetric }}>
            {planAvailable ? plan.monthlyEquivalent : loading ? 'Loading…' : 'Unavailable'}
          </Text>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.medium, fontSize: typeScale.body }}>
            Annual equivalent {planAvailable ? plan.annualEquivalent : ''}
          </Text>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata }}>
            {planAvailable
              ? `${plan.budgetCount} active ${plan.budgetCount === 1 ? 'Budget' : 'Budgets'} · inactive Categories excluded`
              : 'Active Budget totals'}
          </Text>
        </DesignSurface>

        {error ? (
          <View style={{ gap: space.rowGap }}>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              {error}
            </Text>
            <SecondaryButton label="Try again" onPress={onRetry} />
          </View>
        ) : null}

        <TextField
          label="Search Categories"
          value={search}
          onChangeText={setSearch}
          placeholder="Find a Category"
        />

        <View style={{ gap: space.rowGap }}>
          {sectionTitle('Category view')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <SecondaryButton
              label="Active"
              selected={view === 'active'}
              onPress={() => setView('active')}
            />
            <SecondaryButton
              label="Inactive"
              selected={view === 'inactive'}
              onPress={() => setView('inactive')}
            />
          </View>
        </View>

        <View style={{ gap: space.rowGap }}>
          {sectionTitle('Budget filter')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['all', 'monthly', 'yearly', 'unset'] as const).map((value) => (
              <SecondaryButton
                key={value}
                label={value[0]!.toUpperCase() + value.slice(1)}
                selected={filter === value}
                onPress={() => setFilter(value)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space.rowGap }}>
          {sectionTitle('Sort by')}
          <SupportingText>Amount sorts compare exact monthly equivalents.</SupportingText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <SecondaryButton label="Name" selected={sort === 'name'} onPress={() => setSort('name')} />
            <SecondaryButton label="Amount" selected={sort === 'amount'} onPress={() => setSort('amount')} />
            <SortDirectionButton
              sort={sort}
              direction={direction}
              onPress={() => setDirection((current) => current === 'ascending' ? 'descending' : 'ascending')}
            />
          </View>
        </View>

        <View style={{ gap: space.cardGap }}>
          {sectionTitle(categoryViewLabel)}
          {loading && categories.length === 0 ? (
            <SupportingText>Loading Categories and Budgets.</SupportingText>
          ) : null}
          {!loading && !error && categories.length === 0 ? (
            <SupportingText>No Categories yet. Create one to start organizing Expenses.</SupportingText>
          ) : null}
          {categoriesInView.length === 0 && categories.length > 0 ? (
            <SupportingText>{`No ${view === 'active' ? 'active' : 'inactive'} Categories yet.`}</SupportingText>
          ) : null}
          {categoriesInView.length > 0 && visibleCategories.length === 0 ? (
            <View style={{ gap: space.rowGap }}>
              <SupportingText>No Categories match this search and Budget filter.</SupportingText>
              <SecondaryButton label="Clear search and filters" onPress={() => { setSearch(''); setFilter('all'); }} />
            </View>
          ) : null}
          {visibleCategories.map(renderCategoryRow)}
        </View>
      </View>
    </Screen>
  );
}

function SortDirectionButton({
  sort,
  direction,
  onPress,
}: {
  sort: BudgetSortField;
  direction: BudgetSortDirection;
  onPress: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const label = sort === 'name'
    ? direction === 'ascending' ? 'A–Z' : 'Z–A'
    : direction === 'ascending' ? 'Low to high' : 'High to low';
  const accessibilityLabel = `Sort order: ${label}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Double tap to reverse the sort order"
      onPress={onPress}
      style={{
        minHeight: controlSize.primaryAction,
        minWidth: controlSize.minimumTarget,
        borderRadius: radius.control,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: palette.fieldBorder,
        backgroundColor: palette.surfaceModal,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.screenBottom,
        paddingVertical: space.sheetPaddingTop,
      }}>
      <Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.button }}>
        {label}
      </Text>
    </Pressable>
  );
}
