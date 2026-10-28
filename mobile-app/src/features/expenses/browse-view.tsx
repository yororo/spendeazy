import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SpaceCategory } from "@/api/categories-api-client";
import type { ListedExpense } from "@/api/expense-response";
import { ArrowDownWideNarrow, CalendarRange, Search, Shapes } from "lucide-react-native";
import { CompactAction, SecondaryButton } from "@/components/buttons";
import { CategoryIconMark } from "@/components/category-mark";
import { ChoiceSheet } from "@/components/choice-sheet";
import { CanvasBackground } from "@/components/design-surface";
import { MoneyAmount } from "@/components/money-amount";
import { ScreenHeader } from "@/components/screen-header";
import { BodyText, StackGap } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { controlSize, space, typeScale } from "@/constants/theme";
import { useAppTheme } from "@/navigation/app-theme";
import type { ExpenseBrowseSelection } from "./browse-state";
import type { useExpenseBrowse } from "./use-expense-browse";

export function ExpenseBrowse({
  controller,
  onOpenExpense,
  onOpenOtherList,
  onBackToDashboard,
  spaceStatus,
}: {
  controller: ReturnType<typeof useExpenseBrowse>;
  onOpenExpense: (expenseId: string) => void;
  onOpenOtherList?: () => void;
  onBackToDashboard?: () => void;
  spaceStatus: ReactNode;
}) {
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
        accessibilityLabel={`${item.description}, ${category?.name ?? 'Category'}, ${item.amount} Philippine pesos, ${item.expenseDate}${deletedOnly && item.deletedAt ? ', deleted ' + item.deletedAt.slice(0, 10) : ''}`}
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
            {item.description}
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

  const fromError =
    issues.find((issue) => issue.field === "fromDate")?.message ?? null;
  const toError =
    issues.find((issue) => issue.field === "toDate" || issue.field === "range")
      ?.message ?? null;

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
            issues.length === 0 && phase === "ready"
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
            <RefreshControl
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
              <ScreenHeader title={deletedOnly ? "Deleted Expenses" : "Expenses"} accessory={spaceStatus} />
              {loaded && phase === "ready" && issues.length === 0 ? (
                <View style={{ alignItems: 'center', gap: 3, paddingTop: 8, paddingBottom: 4 }}>
                  <Text style={metadataStyle}>{deletedOnly ? 'Deleted total · PHP' : 'Total spent · PHP'}</Text>
                  <MoneyAmount amount={loaded.totalAmount} variant="total" />
                  <Text style={metadataStyle}>{expenseCountLabel(loaded.totalCount)}</Text>
                </View>
              ) : null}
              {selection ? <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <CompactAction label="Dates" selected={!!selection.fromDate || !!selection.toDate} icon={<CalendarRange size={16} color={palette.brandPrimary} />} onPress={() => setFiltersOpen(true)} />
                  <CompactAction label="Category" selected={selection.categoryId !== null} icon={<Shapes size={16} color={palette.brandPrimary} />} onPress={() => setCategoryOpen(true)} />
                  <CompactAction label="Search Expenses" variant="icon" selected={selection.description !== ''} icon={<Search size={17} color={palette.textSecondary} />} onPress={() => setFiltersOpen(true)} />
                  <CompactAction label={selection.sort === 'newest' ? 'Sorted newest first. Switch to oldest first' : 'Sorted oldest first. Switch to newest first'} variant="icon" selected={selection.sort === 'oldest'} icon={<ArrowDownWideNarrow size={17} color={palette.textSecondary} />} onPress={() => onChange({ sort: selection.sort === 'newest' ? 'oldest' : 'newest' })} />
                </View>
                {hasExpenseFilter(selection) ? <Text style={metadataStyle}>{[selection.fromDate || selection.toDate ? (selection.fromDate || 'Any start') + ' – ' + (selection.toDate || 'Any end') : '', selection.categoryId ? categoryName(categories.categories, selection.categoryId) : '', selection.description ? 'Search: ' + selection.description : '', selection.sort === 'oldest' ? 'Oldest first' : ''].filter(Boolean).join(' · ')}</Text> : null}
                {issues.length > 0 ? <Text accessibilityLiveRegion="polite" style={{ ...metadataStyle, color: palette.stateNegative }}>{issues.map((issue) => issue.message).join(' ')}</Text> : null}
              </View> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {onBackToDashboard ? <CompactAction variant="quiet" label="Back to Dashboard" onPress={onBackToDashboard} /> : null}
                {onOpenOtherList ? <CompactAction variant="quiet" label={deletedOnly ? 'Active Expenses' : 'Deleted Expenses'} onPress={onOpenOtherList} /> : null}
              </View>
              {phase === "loading" && !loaded ? (
                <BodyText>Loading Expenses.</BodyText>
              ) : null}
              {error ? (
                <StackGap>
                  <BodyText>{error}</BodyText>
                  <SecondaryButton label="Retry" onPress={() => void retry()} />
                </StackGap>
              ) : null}
            </StackGap>
          }
          ListEmptyComponent={
            phase === "ready" && loaded && loaded.expenses.length === 0 ? (
              <BodyText>
                {selection && hasExpenseFilter(selection)
                  ? "No Expenses match these filters."
                  : deletedOnly
                    ? "No deleted Expenses in this Space."
                    : "No Expenses in this Space yet."}
              </BodyText>
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
          <ChoiceSheet title="Filter Expenses" showClose visible={filtersOpen && !categoryOpen} onDismiss={() => setFiltersOpen(false)}>
            <ExpenseFilters selection={selection} categories={categories.categories} fromError={fromError} toError={toError} onOpenCategories={() => setCategoryOpen(true)} onChange={onChange} />
            <SecondaryButton label="Show Expenses" onPress={() => setFiltersOpen(false)} />
          </ChoiceSheet>
          <ChoiceSheet
            title="Category"
            showClose
            visible={categoryOpen}
            onDismiss={() => setCategoryOpen(false)}
          >
            <SecondaryButton
              label="All Categories"
              selected={selection.categoryId === null}
              onPress={() => {
                onChange({ categoryId: null });
                setCategoryOpen(false);
              }}
            />
            {categories.categories.map((category) => (
              <SecondaryButton
                key={category.id}
                label={
                  category.isActive
                    ? category.name
                    : `${category.name} (inactive)`
                }
                selected={selection.categoryId === category.id}
                onPress={() => {
                  onChange({ categoryId: category.id });
                  setCategoryOpen(false);
                }}
              />
            ))}
          </ChoiceSheet>
        </>
      ) : null}
    </View>
  );
}

function ExpenseFilters({
  selection,
  categories,
  fromError,
  toError,
  onOpenCategories,
  onChange,
}: {
  selection: ExpenseBrowseSelection;
  categories: SpaceCategory[];
  fromError: string | null;
  toError: string | null;
  onOpenCategories: () => void;
  onChange: (patch: Partial<Omit<ExpenseBrowseSelection, "spaceId">>) => void;
}) {
  const selected = categories.find(
    (category) => category.id === selection.categoryId,
  );
  return (
    <StackGap>
      <TextField
        label="From"
        value={selection.fromDate}
        onChangeText={(fromDate) => onChange({ fromDate })}
        error={fromError}
        placeholder="YYYY-MM-DD"
      />
      <TextField
        label="To"
        value={selection.toDate}
        onChangeText={(toDate) => onChange({ toDate })}
        error={toError}
        placeholder="YYYY-MM-DD"
      />
      <SecondaryButton
        label={selected ? selected.name : "All Categories"}
        selected={selection.categoryId !== null}
        onPress={onOpenCategories}
      />
      <DescriptionSearch
        key={`${selection.spaceId}:${selection.description}`}
        selection={selection}
        onChange={onChange}
      />
      <View style={{ flexDirection: "row", gap: space.cardGap }}>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            label="Newest"
            selected={selection.sort === "newest"}
            onPress={() => onChange({ sort: "newest" })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            label="Oldest"
            selected={selection.sort === "oldest"}
            onPress={() => onChange({ sort: "oldest" })}
          />
        </View>
      </View>
      {hasExpenseFilter(selection) ? (
        <SecondaryButton
          label="Clear filters"
          onPress={() =>
            onChange({
              fromDate: "",
              toDate: "",
              categoryId: null,
              description: "",
              sort: "newest",
            })
          }
        />
      ) : null}
    </StackGap>
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
        onBlur={commit}
        placeholder="Search"
      />
      <SecondaryButton label="Search" onPress={commit} />
    </StackGap>
  );
}

function hasExpenseFilter(selection: ExpenseBrowseSelection): boolean {
  return (
    selection.fromDate !== "" ||
    selection.toDate !== "" ||
    selection.categoryId !== null ||
    selection.description.trim() !== "" ||
    selection.sort !== "newest"
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
