import { useMemo, useRef, useState, type ElementRef, type ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { ArrowDown, ArrowUp, Check, ChevronRight, Ellipsis, FolderPlus, ListFilter, Search, X } from 'lucide-react-native';
import { Popover } from '@/components/popover';
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
import { controlSize, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

import { SkeletonBlock, ListSkeleton } from '@/components/skeleton';

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
  const [sortVisible, setSortVisible] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const filterRef = useRef<ElementRef<typeof View>>(null);
  const sortRef = useRef<ElementRef<typeof View>>(null);
  const optionsRef = useRef<ElementRef<typeof View>>(null);
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
  const sortOrderLabel = sort === 'name'
    ? direction === 'ascending' ? 'A to Z' : 'Z to A'
    : direction === 'ascending' ? 'lowest first' : 'highest first';

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
              {showEquivalents ? (
                <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata, textAlign: 'right' }}>
                  {details.originalPeriod === 'month'
                    ? `${details.annualEquivalent}/yr`
                    : `${details.monthlyEquivalentRounded ? '≈ ' : ''}${details.monthlyEquivalent}/mo`}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ color: palette.brandPrimary, fontFamily: fonts.medium, fontSize: 14 }}>
              {actionLabel}
            </Text>
          )}
        </View>
        <ChevronRight size={14} color={palette.textSecondary} accessible={false} />
      </Pressable>
    );
  }

  return (
    <Screen title="Budget" refreshing={refreshing} onRefresh={onRetry} headerAccessory={spaceStatus}>
      <View style={{ gap: space.cardGap }}>
        <View
          accessibilityLabel={planAvailable
            ? `Monthly-equivalent plan ${plan.monthlyEquivalent}; annual equivalent ${plan.annualEquivalent}; ${plan.budgetCount} active ${plan.budgetCount === 1 ? 'Budget' : 'Budgets'}`
            : 'Budget plan loading'}
          style={{ gap: 4, alignItems: 'center', paddingTop: 4, paddingBottom: 6 }}>
          <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>
            Monthly-equivalent plan
          </Text>
          {loading && !error ? <SkeletonBlock width="55%" height={42} /> : <Text accessibilityLiveRegion="polite"
            style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.budgetTotal, letterSpacing: -1.5, textAlign: 'center' }}>
            {planAvailable ? plan.monthlyEquivalent : 'Unavailable'}</Text>}
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
            <Text accessibilityLiveRegion="polite"
              style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              {error}
            </Text>
            <SecondaryButton label="Try again" onPress={onRetry} />
          </View>
        ) : null}

        <View style={{ gap: space.fieldLabelGap }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.fieldLabelGap }}>
            <View style={{ flex: 1 }}>
              <TextField label="Search categories" showLabel={false} value={search} onChangeText={setSearch}
                placeholder="Search categories" variant="underlined" autoCapitalize="none" returnKeyType="search"
                icon={<Search size={17} color={palette.textSecondary} />} />
            </View>
            {search ? <CompactAction label="Clear search" variant="icon" icon={<X size={20} color={palette.textSecondary} />} onPress={() => setSearch('')} /> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.fieldLabelGap }}>
            <View ref={filterRef} collapsable={false}>
              <CompactAction label={filter === 'all' ? 'Budget' : filter[0]!.toUpperCase() + filter.slice(1)}
                accessibilityLabel={'Budget filter: ' + (filter === 'all' ? 'All budgets' : filter)} selected={filter !== 'all'}
                icon={<ListFilter size={16} color={palette.brandPrimary} />} onPress={() => setFiltersVisible(true)} />
            </View>
            <View style={{ flex: 1 }} />
            <View ref={sortRef} collapsable={false} style={{ maxWidth: '100%' }}>
              <CompactAction label={sort === 'name' ? 'Name' : 'Amount'}
                accessibilityLabel={`Sort by ${sort}: ${sortOrderLabel}; opens sort options`}
                icon={direction === 'ascending'
                  ? <ArrowUp size={17} color={palette.textSecondary} />
                  : <ArrowDown size={17} color={palette.textSecondary} />}
                onPress={() => setSortVisible(true)} />
            </View>
            <View ref={optionsRef} collapsable={false}>
              <CompactAction variant="icon" label="More options" selected={view === 'inactive' || showEquivalents}
                icon={<Ellipsis size={22} color={palette.textSecondary} />} onPress={() => setOptionsVisible(true)} />
            </View>
          </View>
        </View>
        <Popover title="Sort" showHeader={false} anchorRef={sortRef} visible={sortVisible} width={controlSize.minimumTarget * 3.5} onDismiss={() => setSortVisible(false)}>
          {(['name', 'amount'] as const).map((field) => (
            <View key={field} style={{ gap: space.rowGap }}>
              {sectionTitle(field === 'name' ? 'Name' : 'Amount')}
              {(field === 'name' ? ['ascending', 'descending'] as const : ['descending', 'ascending'] as const).map((order) => {
                const selected = sort === field && direction === order;
                const label = field === 'name'
                  ? order === 'ascending' ? 'A–Z' : 'Z–A'
                  : order === 'ascending' ? 'Lowest first' : 'Highest first';
                return <CompactAction key={order} variant="quiet" label={label}
                  accessibilityLabel={`Sort by ${field}: ${label}`}
                  selected={selected} icon={selected ? <Check size={18} color={palette.brandPrimary} /> : undefined}
                  onPress={() => { setSort(field); setDirection(order); setSortVisible(false); }} />;
              })}
            </View>
          ))}
        </Popover>
        <Popover title="Budget" showHeader={false} anchorRef={filterRef} visible={filtersVisible} width={controlSize.minimumTarget * 3.5} onDismiss={() => setFiltersVisible(false)}>
          {(['all', 'monthly', 'yearly', 'unset'] as const).map((value) => (
            <CompactAction key={value} variant="quiet" label={value === 'all' ? 'All budgets' : value[0]!.toUpperCase() + value.slice(1)}
              selected={filter === value} icon={filter === value ? <Check size={18} color={palette.brandPrimary} /> : undefined}
              onPress={() => { setFilter(value); setFiltersVisible(false); }} />
          ))}
        </Popover>
        <Popover title="Options" showHeader={false} anchorRef={optionsRef} visible={optionsVisible} width={controlSize.minimumTarget * 5} onDismiss={() => setOptionsVisible(false)}>
          {(['active', 'inactive'] as const).map((value) => (
            <CompactAction key={value} variant="quiet" label={value === 'active' ? 'Active' : 'Inactive'}
              accessibilityLabel={'Show ' + value + ' categories'} selected={view === value}
              icon={view === value ? <Check size={18} color={palette.brandPrimary} /> : undefined}
              onPress={() => { setView(value); setOptionsVisible(false); }} />
          ))}
          <View style={{ borderTopWidth: 1, borderColor: palette.fieldBorder, flexDirection: 'row', alignItems: 'center', gap: space.fieldLabelGap, minHeight: controlSize.minimumTarget }}>
            <Text style={{ flex: 1, color: palette.textPrimary, fontFamily: fonts.medium, fontSize: typeScale.button }}>
              Show equivalents
            </Text>
            <Switch accessibilityLabel="Show equivalents" value={showEquivalents} onValueChange={setShowEquivalents}
              style={{ minWidth: controlSize.minimumTarget, minHeight: controlSize.minimumTarget }} />
          </View>
        </Popover>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {sectionTitle(categoryViewLabel)}
            {canEdit ? <CompactAction variant="icon" label="Create Category" icon={<FolderPlus size={18} color={palette.brandPrimary} />} onPress={onCreate} /> : null}
          </View>
          {loading && categories.length === 0 ? (
            <ListSkeleton label="Loading Budget" total={false} />
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
              <SecondaryButton label="Clear" onPress={() => { setSearch(''); setFilter('all'); }} />
            </View>
          ) : null}
          {visibleCategories.map(renderCategoryRow)}
        </View>
      </View>
    </Screen>
  );
}
