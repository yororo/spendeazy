import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowDownWideNarrow, ChevronRight, FolderPlus, ListFilter, Search } from 'lucide-react-native';
import { ChoiceSheet } from '@/components/choice-sheet';
import { CompactAction, SecondaryButton } from '@/components/buttons';
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
import { space, typeScale } from '@/constants/theme';
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
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [showEquivalents, setShowEquivalents] = useState(false);
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
          minHeight: 67,
          borderTopWidth: 1,
          borderColor: palette.fieldBorder,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          flexWrap: 'wrap',
        }}>
        <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} size={20} />
        <View style={{ flex: 1, minWidth: 80, gap: 3 }}>
          <Text
            style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 14 }}>
            {category.name}
          </Text>
          {!category.isActive ? <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>Inactive</Text> : null}
          {!details ? <Text style={{ color: palette.stateWarning, fontFamily: fonts.regular, fontSize: 12 }}>No Budget set</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '100%', gap: 3 }}>
          {details ? (
            <>
              <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 14 }}>
                {details.originalAmount}
              </Text>
              <Text
                style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata }}>
                per {details.originalPeriod}
              </Text>
            </>
          ) : (
            <Text style={{ color: palette.brandPrimary, fontFamily: fonts.medium, fontSize: 14 }}>
              {actionLabel}
            </Text>
          )}
        </View>
        <ChevronRight size={14} color={palette.textSecondary} accessible={false} />
        {showEquivalents && details ? <Text style={{ width: '100%', color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>
          Monthly equivalent {details.monthlyEquivalent} · Annual equivalent {details.annualEquivalent}
        </Text> : null}
      </Pressable>
    );
  }

  return (
    <Screen title="Budget" refreshing={loading || refreshing} onRefresh={onRetry} headerAccessory={spaceStatus}>
      <View style={{ gap: space.cardGap }}>
        <View
          accessibilityLabel={planAvailable
            ? `Monthly-equivalent plan ${plan.monthlyEquivalent}; annual equivalent ${plan.annualEquivalent}; ${plan.budgetCount} active ${plan.budgetCount === 1 ? 'Budget' : 'Budgets'}`
            : 'Budget plan loading'}
          style={{ gap: 4, alignItems: 'center', paddingTop: 4, paddingBottom: 6 }}>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>
            Monthly-equivalent plan
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.budgetTotal, letterSpacing: -1.5, textAlign: 'center' }}>
            {planAvailable ? plan.monthlyEquivalent : loading ? 'Loading…' : 'Unavailable'}
          </Text>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' }}>
            Annual equivalent {planAvailable ? plan.annualEquivalent : ''}
          </Text>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' }}>
            {planAvailable
              ? `${plan.budgetCount} active ${plan.budgetCount === 1 ? 'Budget' : 'Budgets'} · inactive Categories excluded`
              : 'Active Budget totals'}
          </Text>
        </View>

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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <CompactAction label={filter === 'all' ? 'All' : filter[0]!.toUpperCase() + filter.slice(1)} selected={filter !== 'all' || view === 'inactive'} icon={<ListFilter size={16} color={palette.brandPrimary} />} onPress={() => setFiltersVisible(true)} />
          <CompactAction label="Unset" selected={filter === 'unset'} onPress={() => setFilter(filter === 'unset' ? 'all' : 'unset')} />
          <View style={{ flex: 1 }} />
          <CompactAction variant="icon" label="Search Categories" icon={<Search size={17} color={palette.textSecondary} />} onPress={() => setFiltersVisible(true)} />
          <CompactAction variant="icon" label="Sort Categories" icon={<ArrowDownWideNarrow size={17} color={palette.textSecondary} />} onPress={() => setFiltersVisible(true)} />
        </View>
        <ChoiceSheet title="Search, filter and sort" visible={filtersVisible} onDismiss={() => setFiltersVisible(false)} showClose>
          <TextField
            label="Search Categories"
            value={search}
            onChangeText={setSearch}
            placeholder="Find a Category"
          />

          <View style={{ gap: space.rowGap }}>
            {sectionTitle('Category view')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <CompactAction
                label="Active"
                selected={view === 'active'}
                onPress={() => setView('active')}
              />
              <CompactAction
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
                <CompactAction
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
              <CompactAction label="Name" selected={sort === 'name'} onPress={() => setSort('name')} />
              <CompactAction label="Amount" selected={sort === 'amount'} onPress={() => setSort('amount')} />
              <SortDirectionButton
                sort={sort}
                direction={direction}
                onPress={() => setDirection((current) => current === 'ascending' ? 'descending' : 'ascending')}
              />
            </View>
          </View>

          <CompactAction label={showEquivalents ? 'Hide equivalent amounts' : 'Show equivalent amounts'} selected={showEquivalents} onPress={() => setShowEquivalents(!showEquivalents)} />
          <CompactAction label="Done" onPress={() => setFiltersVisible(false)} />
        </ChoiceSheet>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {sectionTitle(categoryViewLabel)}
            {canEdit ? <CompactAction variant="icon" label="Create Category" icon={<FolderPlus size={18} color={palette.brandPrimary} />} onPress={onCreate} /> : null}
          </View>
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
  const label = sort === 'name'
    ? direction === 'ascending' ? 'A–Z' : 'Z–A'
    : direction === 'ascending' ? 'Low to high' : 'High to low';
  return <CompactAction label={'Sort order: ' + label} onPress={onPress} />;
}
