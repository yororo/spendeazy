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
import { SecondaryButton } from "@/components/buttons";
import { ChoiceSheet } from "@/components/choice-sheet";
import { MoneyAmount } from "@/components/money-amount";
import { BodyText, StackGap, SupportingText } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { controlSize, space, typeScale } from "@/constants/theme";
import { useAppTheme } from "@/navigation/app-theme";
import type { ExpenseBrowseSelection } from "./browse-state";
import type { useExpenseBrowse } from "./use-expense-browse";

export function ExpenseBrowse({
  controller,
  onOpenExpense,
  onOpenOtherList,
  spaceStatus,
}: {
  controller: ReturnType<typeof useExpenseBrowse>;
  onOpenExpense: (expenseId: string) => void;
  onOpenOtherList?: () => void;
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

  const renderExpense: ListRenderItem<ListedExpense> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.description}, ${item.expenseDate}`}
      onPress={() => onOpenExpense(item.id)}
      style={{
        minHeight: controlSize.field,
        justifyContent: "center",
        gap: space.rowGap,
        paddingVertical: space.fieldLabelGap,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: space.cardGap,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: palette.textPrimary,
            fontFamily: fonts.semibold,
            fontSize: typeScale.body,
          }}
        >
          {item.description}
        </Text>
        <MoneyAmount amount={item.amount} />
      </View>
      <SupportingText>
        {`${deletedOnly && item.deletedAt ? `Deleted ${item.deletedAt.slice(0, 10)} · ` : ""}${item.expenseDate} · ${categoryName(categories.categories, item.categoryId)}`}
      </SupportingText>
    </Pressable>
  );

  const fromError =
    issues.find((issue) => issue.field === "fromDate")?.message ?? null;
  const toError =
    issues.find((issue) => issue.field === "toDate" || issue.field === "range")
      ?.message ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
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
            gap: space.cardGap,
          }}
          ListHeaderComponent={
            <StackGap>
              <Text
                accessibilityRole="header"
                style={{
                  color: palette.textPrimary,
                  fontFamily: fonts.semibold,
                  fontSize: typeScale.pageTitle,
                  letterSpacing: typeScale.pageTitleTracking,
                }}
              >
                {deletedOnly ? "Deleted Expenses" : "Expenses"}
              </Text>
              {spaceStatus}
              {onOpenOtherList ? (
                <SecondaryButton
                  label={deletedOnly ? "Active Expenses" : "Deleted Expenses"}
                  onPress={onOpenOtherList}
                />
              ) : null}
              {selection ? (
                <ExpenseFilters
                  selection={selection}
                  categories={categories.categories}
                  fromError={fromError}
                  toError={toError}
                  onOpenCategories={() => setCategoryOpen(true)}
                  onChange={onChange}
                />
              ) : null}
              {loaded && phase === "ready" && issues.length === 0 ? (
                <SupportingText>
                  {`${expenseCountLabel(loaded.totalCount)} · ${loaded.totalAmount} PHP for this selection`}
                </SupportingText>
              ) : null}
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
        <ChoiceSheet
          title="Category"
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
