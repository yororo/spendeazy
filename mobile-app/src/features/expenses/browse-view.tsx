import { PullRefreshControl } from '@/components/pull-refresh-control';
import { useEffect, useRef, useState, type ElementRef, type ReactNode } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { BrowseDateField } from "@/components/native-date-field";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SpaceCategory } from "@/api/categories-api-client";
import type { ListedExpense } from "@/api/expense-response";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, CalendarRange, Search, Shapes, Check, X, ChevronLeft, Ellipsis } from "lucide-react-native";
import { CompactAction, SecondaryButton } from "@/components/buttons";
import { CategoryIconMark } from "@/components/category-mark";
import { ChoiceSheet } from "@/components/choice-sheet";
import { CanvasBackground } from "@/components/design-surface";
import { MoneyAmount } from "@/components/money-amount";
import { ScreenHeader } from "@/components/screen-header";
import { BodyText, StackGap, SupportingText } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { controlSize, space, typeScale } from "@/constants/theme";
import { useAppTheme } from "@/navigation/app-theme";
import { expenseBrowseIssues } from "./browse-state";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [dates, setDates] = useState({ fromDate: '', toDate: '' });
  const toolbarRef = useRef<ElementRef<typeof View>>(null);
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
  const renderExpense: ListRenderItem<ListedExpense> = ({ item }) => {
    const category = categories.categories.find((entry) => entry.id === item.categoryId);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.description || 'Expense'}, ${category?.name ?? 'Category'}, ${item.amount} Philippine pesos, ${item.expenseDate}${deletedOnly && item.deletedAt ? ', deleted ' + item.deletedAt.slice(0, 10) : ''}`}
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
          <Text style={metadataStyle}>{item.expenseDate}</Text>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {onBackToDashboard || (deletedOnly && onOpenOtherList) ? <CompactAction variant="icon" label="Back" icon={<ChevronLeft size={22} color={palette.textPrimary} />} onPress={onBackToDashboard ?? onOpenOtherList!} /> : null}
                <View style={{ flex: 1 }}><ScreenHeader title={deletedOnly ? "Deleted Expenses" : "Expenses"} accessory={spaceStatus} /></View>
              </View>
              {scopeLabel ? <SupportingText>{scopeLabel}</SupportingText> : null}
              {loaded && issues.length === 0 ? (
                <View style={{ alignItems: 'center', gap: 3, paddingTop: 8, paddingBottom: 4 }}>
                  <Text style={metadataStyle}>{deletedOnly ? 'Deleted total · PHP' : 'Total spent · PHP'}</Text>
                  <MoneyAmount amount={loaded.totalAmount} variant="total" />
                  <Text style={metadataStyle}>{expenseCountLabel(loaded.totalCount)}</Text>
                </View>
              ) : null}
              {selection ? <View style={{ gap: 6 }}>
                <View ref={toolbarRef} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <CompactAction accessibilityLabel={`Dates: ${selection.fromDate || "Any start"} to ${selection.toDate || "Any end"}`} variant="icon" label={selection.fromDate || selection.toDate ? `${selection.fromDate || "Any"} – ${selection.toDate || "Any"}` : "Dates"} selected={!!selection.fromDate || !!selection.toDate} icon={<CalendarRange size={16} color={palette.brandPrimary} />} onPress={() => { setDates({ fromDate: selection.fromDate, toDate: selection.toDate }); setFiltersOpen(true); }} />
                  <CompactAction accessibilityLabel={`Category: ${selection.categoryId ? categoryName(categories.categories, selection.categoryId) : "All categories"}`} variant="icon" label={selection.categoryId ? categoryName(categories.categories, selection.categoryId) : "Category"} selected={selection.categoryId !== null} icon={<Shapes size={16} color={palette.brandPrimary} />} onPress={() => setCategoryOpen(true)} />
                  <CompactAction label="Search Expenses" variant="icon" selected={selection.description !== ''} icon={<Search size={17} color={palette.textSecondary} />} onPress={() => setSearchOpen(true)} />
                  <CompactAction label={selection.sort === 'newest' ? 'Sorted newest first. Switch to oldest first' : 'Sorted oldest first. Switch to newest first'} variant="icon" selected={selection.sort === 'oldest'} icon={selection.sort === "newest" ? <ArrowDownWideNarrow size={17} color={palette.textSecondary} /> : <ArrowUpWideNarrow size={17} color={palette.textSecondary} />} onPress={() => onChange({ sort: selection.sort === 'newest' ? 'oldest' : 'newest' })} />
                  {onOpenOtherList && !deletedOnly ? <CompactAction variant="icon" icon={<Ellipsis size={22} color={palette.textSecondary} />} label="More options" onPress={() => setOptionsOpen(true)} /> : null}
                </View>
                {searchOpen || selection.description ? <DescriptionSearch key={`${selection.spaceId}:${selection.description}`} selection={selection} onChange={onChange} onClose={() => { Keyboard.dismiss(); setSearchOpen(false); onChange({ description: "" }); }} /> : null}
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
          <ChoiceSheet title="Options" visible={optionsOpen} showClose onDismiss={() => setOptionsOpen(false)}><SecondaryButton label="Deleted" onPress={() => { setOptionsOpen(false); onOpenOtherList?.(); }} /></ChoiceSheet>
          <ChoiceSheet restoreFocusRef={toolbarRef} title="Dates" visible={filtersOpen} showClose onDismiss={() => setFiltersOpen(false)}>
            <BrowseDateField label="From" value={dates.fromDate} onChange={fromDate => setDates({ ...dates, fromDate })} />
            <BrowseDateField label="To" value={dates.toDate} onChange={toDate => setDates({ ...dates, toDate })} />
            {expenseBrowseIssues({ ...selection, ...dates }).map(issue => <BodyText key={issue.field}>{issue.message}</BodyText>)}
            <SecondaryButton label="Clear" onPress={() => setDates({ fromDate: '', toDate: '' })} />
            <SecondaryButton label="Apply" disabled={expenseBrowseIssues({ ...selection, ...dates }).length > 0} onPress={() => { onChange(dates); setFiltersOpen(false); }} />
          </ChoiceSheet>
          <ChoiceSheet
            restoreFocusRef={toolbarRef}
            maxHeight="65%"
            title="Category"
            showClose
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
          </ChoiceSheet>
        </>
      ) : null}
    </View>
  );
}

function DescriptionSearch({
  selection,
  onChange,
  onClose,
}: {
  selection: ExpenseBrowseSelection;
  onChange: (patch: Partial<Omit<ExpenseBrowseSelection, "spaceId">>) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(selection.description);


  function commit() {
    if (description === selection.description) return;
    onChange({ description });
  }

  return (
    <StackGap>
      <TextField
        label="Search description"
        value={description}
        onChangeText={setDescription}
        onSubmitEditing={commit}
        returnKeyType="search"
        autoFocus
        placeholder="Search"
      />
      <CompactAction label="Close search" variant="icon" icon={<X size={20} />} onPress={onClose} />
    </StackGap>
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

// Keep calendar days local: UTC serialization can shift a selected date by a day.
