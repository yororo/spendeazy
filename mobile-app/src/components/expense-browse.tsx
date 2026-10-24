import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExpenseApiError, ExpenseApiTransportError } from '@/api/authorized-request';
import type { SpaceCategory } from '@/api/categories-api-client';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { MoneyAmount } from '@/components/money-amount';
import { BodyText, StackGap, SupportingText } from '@/components/screen';
import { SpaceStatus } from '@/components/space-status';
import { TextField } from '@/components/text-field';
import { controlSize, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { useAuthorizedClient } from '@/navigation/authorized-client';
import {
  applyExpensePage,
  emptyExpenseBrowse,
  ensureExpenseBrowse,
  expenseBrowseIssues,
  expenseBrowseSnapshot,
  expenseListQuery,
  readExpensePage,
  readExpenseScroll,
  rememberExpenseScroll,
  subscribeExpenseBrowse,
  updateExpenseBrowse,
  type ExpenseBrowseSelection,
  type ExpensePagePayload,
  type ListedExpense,
} from '@/navigation/expense-browse';
import { useSpaces } from '@/navigation/spaces-provider';
import { useSpaceCategories } from '@/navigation/use-space-categories';

export function ExpenseBrowse() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette, fonts } = useAppTheme();
  const { active, refresh: refreshSpaces, loading: spacesLoading, refreshing: spacesRefreshing } = useSpaces();
  const authorized = useAuthorizedClient();
  const browse = useSyncExternalStore(
    subscribeExpenseBrowse,
    expenseBrowseSnapshot,
    expenseBrowseSnapshot,
  );
  const spaceId = active?.id ?? null;
  const selection =
    spaceId === null
      ? null
      : browse.selection?.spaceId === spaceId
        ? browse.selection
        : emptyExpenseBrowse(spaceId);
  const categories = useSpaceCategories(spaceId);
  const [result, setResult] = useState<{
    key: string;
    loaded: ExpensePagePayload | null;
    error: string | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const issues = selection ? expenseBrowseIssues(selection) : [];
  const queryKey = selection ? JSON.stringify(expenseListQuery(selection)) : '';
  const requestKey = `${spaceId ?? ''}:${browse.listRevision}:${queryKey}`;
  const currentResult = result?.key === requestKey ? result : null;
  const loaded = issues.length === 0 ? (currentResult?.loaded ?? null) : null;
  const error = currentResult?.error ?? null;
  const phase =
    issues.length > 0 ? 'ready' : currentResult === null ? 'loading' : error && !loaded ? 'error' : 'ready';
  const listRef = useRef<FlatList<ListedExpense>>(null);
  const restoredQuery = useRef('');

  useEffect(() => {
    if (!spaceId || !loaded?.expenses.length) return;
    const key = `${spaceId}:${queryKey}`;
    if (restoredQuery.current === key) return;
    restoredQuery.current = key;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: readExpenseScroll(), animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded?.expenses.length, queryKey, spaceId]);

  useEffect(() => {
    if (!spaceId) return;
    const currentSelection = ensureExpenseBrowse(spaceId);
    if (expenseBrowseIssues(currentSelection).length > 0) return;
    let current = true;
    const key = `${spaceId}:${browse.listRevision}:${JSON.stringify(expenseListQuery(currentSelection))}`;
    createExpenseApiClient(authorized)
      .listExpenses(spaceId, expenseListQuery(currentSelection))
      .then((payload) => {
        if (!current) return;
        setResult({
          key,
          loaded: applyExpensePage(null, readExpensePage(payload)),
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setResult({ key, loaded: null, error: expenseLoadMessage(cause) });
      });
    return () => {
      current = false;
    };
  }, [authorized, browse.listRevision, queryKey, spaceId]);

  async function reload() {
    if (!spaceId || !selection || issues.length > 0) return;
    setRefreshing(true);
    try {
      const payload = await createExpenseApiClient(authorized).listExpenses(
        spaceId,
        expenseListQuery(selection),
      );
      setResult({
        key: requestKey,
        loaded: applyExpensePage(null, readExpensePage(payload)),
        error: null,
      });
      rememberExpenseScroll(0);
    } catch (cause) {
      setResult({
        key: requestKey,
        loaded,
        error: expenseLoadMessage(cause),
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    if (!spaceId || !selection || !loaded?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const payload = await createExpenseApiClient(authorized).listExpenses(
        spaceId,
        expenseListQuery(selection, loaded.nextCursor),
      );
      setResult({
        key: requestKey,
        loaded: applyExpensePage(loaded, readExpensePage(payload)),
        error: null,
      });
    } catch (cause) {
      setResult({
        key: requestKey,
        loaded,
        error: expenseLoadMessage(cause),
      });
    } finally {
      setLoadingMore(false);
    }
  }

  const renderExpense: ListRenderItem<ListedExpense> = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.description}, ${item.expenseDate}`}
      onPress={() =>
        router.push({
          pathname: '/expense/[expenseId]',
          params: { expenseId: item.id },
        })
      }
        style={{
        minHeight: controlSize.field,
        justifyContent: 'center',
        gap: space.rowGap,
        paddingVertical: space.fieldLabelGap,
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.cardGap }}>
        <Text
          style={{
            flex: 1,
            color: palette.textPrimary,
            fontFamily: fonts.semibold,
            fontSize: typeScale.body,
          }}>
          {item.description}
        </Text>
        <MoneyAmount amount={item.amount} />
      </View>
      <SupportingText>
        {`${item.expenseDate} · ${categoryName(categories.categories, item.categoryId)}`}
      </SupportingText>
    </Pressable>
  );

  const fromError = issues.find((issue) => issue.field === 'fromDate')?.message ?? null;
  const toError =
    issues.find((issue) => issue.field === 'toDate' || issue.field === 'range')?.message ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={listRef}
        data={issues.length === 0 && phase === 'ready' ? (loaded?.expenses ?? []) : []}
        keyExtractor={(expense) => expense.id}
        renderItem={renderExpense}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          if ((loaded?.expenses.length ?? 0) === 0) return;
          rememberExpenseScroll(event.nativeEvent.contentOffset.y);
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
          paddingBottom: insets.bottom + controlSize.navigation + controlSize.addAction,
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
              }}>
              Expenses
            </Text>
            <SpaceStatus />
            {selection ? (
              <ExpenseFilters
                selection={selection}
                categories={categories.categories}
                fromError={fromError}
                toError={toError}
                onOpenCategories={() => setCategoryOpen(true)}
              />
            ) : null}
            {loaded && phase === 'ready' && issues.length === 0 ? (
              <SupportingText>
                {`${expenseCountLabel(loaded.totalCount)} · ${loaded.totalAmount} PHP for this selection`}
              </SupportingText>
            ) : null}
            {phase === 'loading' && !loaded ? <BodyText>Loading Expenses.</BodyText> : null}
            {error ? (
              <StackGap>
                <BodyText>{error}</BodyText>
                <SecondaryButton label="Retry" onPress={() => void reload()} />
              </StackGap>
            ) : null}
          </StackGap>
        }
        ListEmptyComponent={
          phase === 'ready' && loaded && loaded.expenses.length === 0 ? (
            <BodyText>
              {selection && hasExpenseFilter(selection)
                ? 'No Expenses match these filters.'
                : 'No Expenses in this Space yet.'}
            </BodyText>
          ) : undefined
        }
        ListFooterComponent={
          issues.length === 0 && loaded?.nextCursor ? (
            <SecondaryButton
              label={loadingMore ? 'Loading more Expenses' : 'Load more'}
              onPress={() => void loadMore()}
            />
          ) : undefined
        }
      />
    </KeyboardAvoidingView>
      {selection ? (
        <ChoiceSheet title="Category" visible={categoryOpen} onDismiss={() => setCategoryOpen(false)}>
          <SecondaryButton
            label="All Categories"
            selected={selection.categoryId === null}
            onPress={() => {
              updateExpenseBrowse(selection.spaceId, { categoryId: null });
              setCategoryOpen(false);
            }}
          />
          {categories.categories.map((category) => (
            <SecondaryButton
              key={category.id}
              label={category.isActive ? category.name : `${category.name} (inactive)`}
              selected={selection.categoryId === category.id}
              onPress={() => {
                updateExpenseBrowse(selection.spaceId, { categoryId: category.id });
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
}: {
  selection: ExpenseBrowseSelection;
  categories: SpaceCategory[];
  fromError: string | null;
  toError: string | null;
  onOpenCategories: () => void;
}) {
  const selected = categories.find((category) => category.id === selection.categoryId);
  return (
    <StackGap>
      <TextField
        label="From"
        value={selection.fromDate}
        onChangeText={(fromDate) => updateExpenseBrowse(selection.spaceId, { fromDate })}
        error={fromError}
        placeholder="YYYY-MM-DD"
      />
      <TextField
        label="To"
        value={selection.toDate}
        onChangeText={(toDate) => updateExpenseBrowse(selection.spaceId, { toDate })}
        error={toError}
        placeholder="YYYY-MM-DD"
      />
      <SecondaryButton
        label={selected ? selected.name : 'All Categories'}
        selected={selection.categoryId !== null}
        onPress={onOpenCategories}
      />
      <DescriptionSearch
        key={`${selection.spaceId}:${selection.description}`}
        selection={selection}
      />
      <View style={{ flexDirection: 'row', gap: space.cardGap }}>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            label="Newest"
            selected={selection.sort === 'newest'}
            onPress={() => updateExpenseBrowse(selection.spaceId, { sort: 'newest' })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            label="Oldest"
            selected={selection.sort === 'oldest'}
            onPress={() => updateExpenseBrowse(selection.spaceId, { sort: 'oldest' })}
          />
        </View>
      </View>
      {hasExpenseFilter(selection) ? (
        <SecondaryButton
          label="Clear filters"
          onPress={() =>
            updateExpenseBrowse(selection.spaceId, {
              fromDate: '',
              toDate: '',
              categoryId: null,
              description: '',
              sort: 'newest',
            })
          }
        />
      ) : null}
    </StackGap>
  );
}

function DescriptionSearch({ selection }: { selection: ExpenseBrowseSelection }) {
  const [description, setDescription] = useState(selection.description);

  function commit() {
    if (description === selection.description) return;
    updateExpenseBrowse(selection.spaceId, { description });
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
    selection.fromDate !== '' ||
    selection.toDate !== '' ||
    selection.categoryId !== null ||
    selection.description.trim() !== '' ||
    selection.sort !== 'newest'
  );
}

function categoryName(categories: SpaceCategory[], categoryId: string): string {
  return categories.find((category) => category.id === categoryId)?.name ?? 'Category';
}

function expenseCountLabel(totalCount: string): string {
  return totalCount === '1' ? '1 Expense' : `${totalCount} Expenses`;
}

function expenseLoadMessage(cause: unknown): string {
  if (cause instanceof ExpenseApiError || cause instanceof ExpenseApiTransportError) return cause.message;
  if (cause instanceof Error && cause.message.startsWith('Expenses response')) {
    return 'Expenses could not be read. Try again.';
  }
  return 'Expenses could not be loaded. Try again.';
}
