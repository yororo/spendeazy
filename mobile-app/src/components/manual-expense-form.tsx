import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ExpenseApiError, ExpenseApiTransportError } from '@/api/authorized-request';
import type { SpaceCategory } from '@/api/categories-api-client';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { typeScale } from '@/constants/theme';
import { useAuthorizedClient } from '@/navigation/authorized-client';
import {
  defaultManualExpenseDraft,
  manualExpenseRequest,
  todayInManila,
  validateManualExpenseDraft,
  type ManualExpenseDraft,
  type ManualExpenseField,
} from '@/navigation/manual-expense-draft';
import { noteManualExpenseSaved } from '@/navigation/expense-browse';
import { useAppTheme } from '@/navigation/app-theme';
import { useSpaceCategories } from '@/navigation/use-space-categories';
import { useSpaces } from '@/navigation/spaces-provider';

export function ManualExpenseForm() {
  const router = useRouter();
  const { active } = useSpaces();
  const { palette, fonts } = useAppTheme();
  const authorized = useAuthorizedClient();
  const categories = useSpaceCategories(active?.id ?? null);
  const [draft, setDraft] = useState<ManualExpenseDraft>(() =>
    defaultManualExpenseDraft(todayInManila(new Date())),
  );
  const [issues, setIssues] = useState<Partial<Record<ManualExpenseField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const activeCategories = categories.categories.filter((category) => category.isActive);
  const selected = activeCategories.find((category) => category.id === draft.categoryId) ?? null;

  function update(patch: Partial<ManualExpenseDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setSaveError(null);
  }

  async function save() {
    if (!active || saving) return;
    const today = todayInManila(new Date());
    const nextIssues = validateManualExpenseDraft(draft, today);
    if (nextIssues.length > 0) {
      setIssues(Object.fromEntries(nextIssues.map((issue) => [issue.field, issue.message])));
      return;
    }
    setIssues({});
    setSaving(true);
    setSaveError(null);
    try {
      await createExpenseApiClient(authorized).createManualExpense(
        active.id,
        manualExpenseRequest(draft),
      );
      noteManualExpenseSaved();
      router.back();
    } catch (cause) {
      setSaveError(saveFailureMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!active) {
    return (
      <Screen title="Add Expense">
        <BodyText>Choose a Space before adding an Expense.</BodyText>
      </Screen>
    );
  }

  if (active.accessLevel !== 'write') {
    return (
      <Screen title="Add Expense">
        <StackGap>
          <BodyText>This Space is read-only. Expenses cannot be added.</BodyText>
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </StackGap>
      </Screen>
    );
  }

  return (
    <Screen title="Add Expense">
      <StackGap>
        <TextField
          label="Amount"
          value={draft.amount}
          onChangeText={(amount) => update({ amount })}
          error={issues.amount}
          placeholder="12.50"
          keyboardType="decimal-pad"
        />
        <TextField
          label="Description"
          value={draft.description}
          onChangeText={(description) => update({ description })}
          error={issues.description}
          placeholder="What was this Expense?"
        />
        <View style={{ gap: 6 }}>
          <SupportingText>Category</SupportingText>
          <SecondaryButton
            label={selected?.name ?? 'Choose Category'}
            selected={selected !== null}
            onPress={() => setCategoryOpen(true)}
          />
          {issues.categoryId ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              {issues.categoryId}
            </Text>
          ) : null}
        </View>
        <TextField
          label="Date"
          value={draft.expenseDate}
          onChangeText={(expenseDate) => update({ expenseDate })}
          error={issues.expenseDate}
          placeholder="YYYY-MM-DD"
        />
        <SupportingText>Today in Manila is the suggested date. Added By is recorded by Spendeazy.</SupportingText>
        {categories.error ? (
          <StackGap>
            <BodyText>{categories.error}</BodyText>
            <SecondaryButton label="Retry Categories" onPress={categories.reload} />
          </StackGap>
        ) : null}
        {categories.loading ? <BodyText>Loading Categories.</BodyText> : null}
        {!categories.loading && !categories.error && activeCategories.length === 0 ? (
          <BodyText>Add a Category in Budget before recording an Expense.</BodyText>
        ) : null}
        {saveError ? <BodyText>{saveError}</BodyText> : null}
        <PrimaryButton
          label={saveError ? 'Try again' : 'Save Expense'}
          onPress={() => void save()}
          busy={saving}
          disabled={saving || categories.loading || activeCategories.length === 0}
        />
        <ChoiceSheet title="Category" visible={categoryOpen} onDismiss={() => setCategoryOpen(false)}>
          {activeCategories.map((category) => (
            <CategoryChoice
              key={category.id}
              category={category}
              selected={category.id === draft.categoryId}
              onPress={() => {
                update({ categoryId: category.id });
                setCategoryOpen(false);
              }}
            />
          ))}
        </ChoiceSheet>
      </StackGap>
    </Screen>
  );
}

function CategoryChoice({
  category,
  selected,
  onPress,
}: {
  category: SpaceCategory;
  selected: boolean;
  onPress: () => void;
}) {
  return <SecondaryButton label={category.name} selected={selected} onPress={onPress} />;
}

function saveFailureMessage(cause: unknown): string {
  if (cause instanceof ExpenseApiError || cause instanceof ExpenseApiTransportError) {
    return `${cause.message} The entered Expense is still here.`;
  }
  return 'The Expense was not saved. The entered values are still here.';
}
