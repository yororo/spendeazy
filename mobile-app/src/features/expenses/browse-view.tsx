import { PullRefreshControl } from '@/components/pull-refresh-control';
import { useEffect, useRef, useState, type ElementRef, type ReactNode } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  Switch,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { BrowseDateField } from "@/components/native-date-field";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SpaceCategory } from "@/api/categories-api-client";
import type { ListedExpense } from "@/api/expense-response";
import { ArrowDown, ArrowUp, CalendarRange, Search, Shapes, Check, X, ChevronLeft, Ellipsis } from "lucide-react-native";
import { CompactAction, SecondaryButton } from "@/components/buttons";
import { CategoryIconMark } from "@/components/category-mark";
import { Popover } from '@/components/popover';
import { ChoiceSheet } from "@/components/choice-sheet";
import { CanvasBackground } from "@/components/design-surface";
import { MoneyAmount } from "@/components/money-amount";
import { ScreenHeader } from "@/components/screen-header";
import { BodyText, StackGap, SupportingText } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { controlSize, space, typeScale } from "@/constants/theme";
import { useAppTheme } from "@/navigation/app-theme";
import { expenseBrowseIssues } from "./browse-state";
import { formatBrowseDate, formatBrowseDateRange } from './browse-format';
import type { ExpenseBrowseSelection } from "./browse-state";
import type { useExpenseBrowse } from "./use-expense-browse";

import { ListSkeleton } from '@/components/skeleton';

import { useSpaces } from '@/application/spaces/provider';
export function ExpenseBrowse({
  controller,
  onOpenExpense,
  onOpenOtherList,
  onBackToDashboard,
  spaceStatus,
  scopeLabel,
}: {
  controller: ReturnType<typeof useExpenseBrowse>;
  onOpenExpense: (expenseId: string) => void;
  onOpenOtherList?: () => void;
  onBackToDashboard?: () => void;
  spaceStatus: ReactNode;
  scopeLabel?: string;
}) {
  const spaces = useSpaces();
  const insets = useSafeAreaInsets();
  const { palette, fonts } = useAppTheme();
  const {
    spaceId,
    selection,
    categories,
    issues,
    queryKey,
    loaded,
    error,
    phase,
    refreshing,
    loadingMore,
    spacesLoading,
    spacesRefreshing,
    refreshSpaces,
    reload,
    retry,
    loadMore,
    updateSelection: onChange,
    readScroll,
    rememberScroll,
  } = controller;
  const deletedOnly = controller.deletedOnly ?? false;
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [dates, setDates] = useState({ fromDate: '', toDate: '' });
  const categoryRef = useRef<ElementRef<typeof View>>(null);
  const toolbarRef = useRef<ElementRef<typeof View>>(null);
  const optionsRef = useRef<ElementRef<typeof View>>(null);
  const sortRef = useRef<ElementRef<typeof View>>(null);
  const listRef = useRef<FlatList<ListedExpense>>(null);
  const restoredQuery = useRef("");
  useEffect(() => {
    if (!spaceId || !loaded?.expenses.length) return;
    const key = `${spaceId}:${queryKey}`;
    if (restoredQuery.current === key) return;
    restoredQuery.current = key;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: readScroll(),
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded?.expenses.length, queryKey, readScroll, spaceId]);

  const metadataStyle = { color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata };
  const sortByDate = selection?.sort === 'newest' || selection?.sort === 'oldest';
  const sortAscending = selection?.sort === 'oldest' || selection?.sort === 'lowest';
  const sortLabels = { newest: 'Newest first', oldest: 'Oldest first', highest: 'Highest first', lowest: 'Lowest first' } as const;
  const renderExpense: ListRenderItem<ListedExpense> = ({ item }) => {
    const category = categories.categories.find((entry) => entry.id === item.categoryId);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.description || 'Expense'}, ${category?.name ?? 'Category'}, ${item.amount} Philippine pesos, ${formatExpenseDate(item.expenseDate)}${deletedOnly && item.deletedAt ? ', deleted ' + item.deletedAt.slice(0, 10) : ''}`}
        onPress={() => onOpenExpense(item.id)}
        style={{
          minHeight: controlSize.field,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 11,
          borderTopWidth: 1,
          borderColor: palette.fieldBorder,
        }}
      >
        <CategoryIconMark iconKey={category?.iconKey ?? 'shapes'} colorKey={category?.colorKey ?? 'slate'} size={18} />
        <View
          style={{
            flex: 1,
            gap: 5,
          }}
        >
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.medium,
              fontSize: 14,
            }}
          >
            {item.description || 'Expense'}
          </Text>
          <Text style={metadataStyle}>{category?.name ?? 'Category'}</Text>
          {deletedOnly && item.deletedAt ? <Text style={metadataStyle}>{`Deleted ${item.deletedAt.slice(0, 10)}`}</Text> : null}
        </View>
        <View style={{ flexShrink: 1, alignItems: 'flex-end', gap: 5 }}>
          <MoneyAmount amount={item.amount} variant="row" />
          <Text style={metadataStyle}>{formatExpenseDate(item.expenseDate)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <CanvasBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={listRef}
          data={
            issues.length === 0 && (phase === "ready" || phase === "refreshing" || phase === "appending")
              ? (loaded?.expenses ?? [])
              : []
          }
          keyExtractor={(expense) => expense.id}
          renderItem={renderExpense}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            if ((loaded?.expenses.length ?? 0) === 0) return;
            rememberScroll(event.nativeEvent.contentOffset.y);
          }}
          scrollEventThrottle={32}
          refreshControl={
            <PullRefreshControl
              refreshing={refreshing || spacesLoading || spacesRefreshing}
              onRefresh={() => {
                refreshSpaces();
                void reload();
              }}
              tintColor={palette.brandPrimary}
            />
          }
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + space.cardGap,
            paddingBottom:
              insets.bottom + controlSize.navigation + controlSize.addAction,
            paddingHorizontal: space.screenHorizontal,
          }}
          ListHeaderComponent={
            <StackGap>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.fieldLabelGap }}>
                {onBackToDashboard || (deletedOnly && onOpenOtherList) ? <CompactAction variant="icon" label="Back" icon={<ChevronLeft size={22} color={palette.textPrimary} />} onPress={onBackToDashboard ?? onOpenOtherList!} /> : null}
                <View style={{ flex: 1 }}><ScreenHeader title={deletedOnly ? "Deleted Expenses" : "Expenses"} accessory={spaceStatus} /></View>
              </View>
              {scopeLabel ? <SupportingText>{scopeLabel}</SupportingText> : null}
              {loaded && issues.length === 0 ? (
                <View style={{ alignItems: 'center', gap: 3, paddingTop: 8, paddingBottom: 4 }}>
                  <Text style={metadataStyle}>{deletedOnly ? 'Deleted total' : 'Total spent'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text accessible={false} style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 42, letterSpacing: -2 }}>₱</Text>
                    <MoneyAmount amount={loaded.totalAmount} variant="total" />
                  </View>
                  <Text style={metadataStyle}>{expenseCountLabel(loaded.totalCount)}</Text>
                </View>
              ) : null}
              {selection ? <View style={{ gap: space.fieldLabelGap }}>
                <DescriptionSearch key={selection.spaceId} selection={selection} onChange={onChange} />
                <View ref={toolbarRef} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.fieldLabelGap }}>
                  <CompactAction wrapLabel accessibilityLabel={`Dates: ${selection.fromDate ? formatBrowseDate(selection.fromDate) : "Any start"} to ${selection.toDate ? formatBrowseDate(selection.toDate) : "Any end"}`} label={formatBrowseDateRange(selection.fromDate, selection.toDate)} selected={!!selection.fromDate || !!selection.toDate} icon={<CalendarRange size={16} color={palette.brandPrimary} />} onPress={() => { setDates({ fromDate: selection.fromDate, toDate: selection.toDate }); setFiltersOpen(true); }} />
                  <View ref={categoryRef} collapsable={false} style={{ maxWidth: '100%' }}>
                  <CompactAction wrapLabel accessibilityLabel={`Category: ${selection.categoryId ? categoryName(categories.categories, selection.categoryId) : "All categories"}`} label={selection.categoryId ? categoryName(categories.categories, selection.categoryId) : "Category"} selected={selection.categoryId !== null} icon={<Shapes size={16} color={palette.brandPrimary} />} onPress={() => setCategoryOpen(true)} />
                  </View>
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.fieldLabelGap, maxWidth: '100%' }}>
                    <View ref={sortRef} collapsable={false} style={{ flexShrink: 1 }}>
                      <CompactAction wrapLabel label={sortByDate ? 'Date' : 'Amount'} accessibilityLabel={`Sort by ${sortByDate ? 'date' : 'amount'}: ${sortLabels[selection.sort]}; opens sort options`}
                        icon={sortAscending ? <ArrowUp size={17} color={palette.textSecondary} /> : <ArrowDown size={17} color={palette.textSecondary} />}
                        onPress={() => setSortOpen(true)} />
                    </View>
                    {onOpenOtherList ? <View ref={optionsRef} collapsable={false}>
                      <CompactAction variant="icon" label="More options" selected={deletedOnly} icon={<Ellipsis size={22} color={palette.textSecondary} />} onPress={() => setOptionsOpen(true)} />
                    </View> : null}
                  </View>
                </View>
                {issues.length > 0 ? <Text accessibilityLiveRegion="polite" style={{ ...metadataStyle, color: palette.stateNegative }}>{issues.map((issue) => issue.message).join(' ')}</Text> : null}
              </View> : null}
              {!loaded && !error && !spaces.error && (phase === "loading" || spacesLoading) ? (
                <ListSkeleton label="Loading Expenses" />
              ) : null}
              {spaces.error && !spaceId ? <StackGap><BodyText>{spaces.error}</BodyText><SecondaryButton label="Retry" onPress={() => void refreshSpaces()} /></StackGap> : null}{error ? (
                <StackGap>
                  <BodyText>{error}</BodyText>
                  <SecondaryButton label="Retry" onPress={() => void retry()} />
                </StackGap>
              ) : null}
            </StackGap>
          }
          ListEmptyComponent={
            phase === "ready" && loaded && loaded.expenses.length === 0 ? (
              <StackGap><BodyText>
                {selection && hasExpenseFilter(selection)
                  ? "No Expenses match these filters."
                  : deletedOnly
                    ? "No deleted Expenses in this Space."
                    : "No expenses yet. Use + to add an expense or import a statement."}
              </BodyText>{selection && hasExpenseFilter(selection) ? <SecondaryButton label="Clear filters" onPress={() => onChange({ fromDate: "", toDate: "", categoryId: null, description: "" })} /> : null}</StackGap>
            ) : undefined
          }
          ListFooterComponent={
            issues.length === 0 &&
            loaded?.nextCursor &&
            !refreshing &&
            !loadingMore ? (
              <SecondaryButton
                label="Load more"
                onPress={() => void loadMore()}
              />
            ) : loadingMore ? (
              <BodyText>Loading more Expenses.</BodyText>
            ) : undefined
          }
        />
      </KeyboardAvoidingView>
      {selection ? (
        <>
          <Popover anchorRef={sortRef} title="Sort" showHeader={false} visible={sortOpen} onDismiss={() => setSortOpen(false)} width={controlSize.minimumTarget * 5}>
            {(['Date', 'Amount'] as const).map(field => (
              <View key={field} style={{ gap: space.rowGap }}>
                <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle }}>{field}</Text>
                {(field === 'Date' ? ['newest', 'oldest'] as const : ['highest', 'lowest'] as const).map(sort => (
                  <CompactAction wrapLabel key={sort} variant="quiet" label={sortLabels[sort]} accessibilityLabel={`Sort by ${field.toLowerCase()}: ${sortLabels[sort]}`} selected={selection.sort === sort}
                    icon={selection.sort === sort ? <Check size={18} color={palette.brandPrimary} /> : undefined}
                    onPress={() => { onChange({ sort }); setSortOpen(false); }} />
                ))}
              </View>
            ))}
          </Popover>
          {onOpenOtherList ? <Popover anchorRef={optionsRef} title="Options" visible={optionsOpen} showHeader={false} onDismiss={() => setOptionsOpen(false)} width={controlSize.minimumTarget * 5}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.fieldLabelGap, minHeight: controlSize.minimumTarget }}>
              <Text style={{ flex: 1, color: palette.textPrimary, fontFamily: fonts.medium, fontSize: typeScale.button }}>Deleted only</Text>
              <Switch accessibilityLabel="Deleted only" value={deletedOnly} onValueChange={() => { setOptionsOpen(false); onOpenOtherList(); }}
                style={{ minWidth: controlSize.minimumTarget, minHeight: controlSize.minimumTarget }} />
            </View>
          </Popover> : null}
          <ChoiceSheet restoreFocusRef={toolbarRef} title="Dates" visible={filtersOpen} showClose onDismiss={() => setFiltersOpen(false)}>
            <BrowseDateField label="From" value={dates.fromDate} onChange={fromDate => setDates({ ...dates, fromDate })} />
            <BrowseDateField label="To" value={dates.toDate} onChange={toDate => setDates({ ...dates, toDate })} />
            {expenseBrowseIssues({ ...selection, ...dates }).map(issue => <BodyText key={issue.field}>{issue.message}</BodyText>)}
            <SecondaryButton label="Clear" onPress={() => setDates({ fromDate: '', toDate: '' })} />
            <SecondaryButton label="Apply" disabled={expenseBrowseIssues({ ...selection, ...dates }).length > 0} onPress={() => { onChange(dates); setFiltersOpen(false); }} />
          </ChoiceSheet>
          <Popover
            anchorRef={categoryRef}
            width={controlSize.minimumTarget * 6}
            title="Category"
            showHeader={false}
            visible={categoryOpen}
            onDismiss={() => setCategoryOpen(false)}
          >
            <SecondaryButton
              label={selection.categoryId === null ? "✓ All Categories" : "All Categories"}
              selected={selection.categoryId === null}
              onPress={() => {
                onChange({ categoryId: null });
                setCategoryOpen(false);
              }}
            />
            {categories.categories.map((category) => (
              <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={category.name + (category.isActive ? '' : ', inactive')} accessibilityState={{ selected: selection.categoryId === category.id }} onPress={() => { onChange({ categoryId: category.id }); setCategoryOpen(false); }} style={{ minHeight: 52, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CategoryIconMark iconKey={category.iconKey} colorKey={category.colorKey} size={20} />
                <Text style={{ ...metadataStyle, flex: 1 }}>{category.name}{category.isActive ? '' : ' (inactive)'}</Text>
                {selection.categoryId === category.id ? <Check size={18} color={palette.brandPrimary} /> : null}
              </Pressable>
            ))}
          </Popover>
        </>
      ) : null}
    </View>
  );
}

function DescriptionSearch({
  selection,
  onChange,
}: {
  selection: ExpenseBrowseSelection;
  onChange: (patch: Partial<Omit<ExpenseBrowseSelection, "spaceId">>) => void;
}) {
  const [description, setDescription] = useState(selection.description);
  const [previousDescription, setPreviousDescription] = useState(selection.description);
  if (previousDescription !== selection.description) {
    setPreviousDescription(selection.description);
    setDescription(selection.description);
  }
  const { palette } = useAppTheme();
  const changeRef = useRef(onChange);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    if (description === selection.description) return;
    const timeout = setTimeout(() => changeRef.current({ description }), 300);
    return () => clearTimeout(timeout);
  }, [description, selection.description]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.fieldLabelGap }}>
      <View style={{ flex: 1 }}>
        <TextField
          label="Search description"
          showLabel={false}
          value={description}
          onChangeText={setDescription}
          onSubmitEditing={() => onChange({ description })}
          returnKeyType="search"
          placeholder="Search description"
          variant="underlined"
          icon={<Search size={17} color={palette.textSecondary} />}
        />
      </View>
      {description ? <CompactAction label="Clear search" variant="icon" icon={<X size={20} color={palette.textSecondary} />} onPress={() => { setDescription(''); onChange({ description: '' }); }} /> : null}
    </View>
  );
}

function hasExpenseFilter(selection: ExpenseBrowseSelection): boolean {
  return (
    selection.fromDate !== "" ||
    selection.toDate !== "" ||
    selection.categoryId !== null ||
    selection.description.trim() !== ""
  );
}

function categoryName(categories: SpaceCategory[], categoryId: string): string {
  return (
    categories.find((category) => category.id === categoryId)?.name ??
    "Category"
  );
}

function expenseCountLabel(totalCount: string): string {
  return totalCount === "1" ? "1 Expense" : `${totalCount} Expenses`;
}

function formatExpenseDate(value: string): string {
  const [year, month, day] = value.split('-');
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  return `${months[Number(month) - 1]} ${Number(day)}, ${year}`;
}
