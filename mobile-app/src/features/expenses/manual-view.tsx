import { useState } from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import type { ManualExpenseDraft, ManualExpenseField } from './manual-draft';

export type ManualExpenseFormState = {
  availability: 'missing-space' | 'read-only' | 'archived' | 'editable';
  draft: ManualExpenseDraft;
  issues: Partial<Record<ManualExpenseField, string>>;
  saving: boolean;
  canSave: boolean;
  saveError: string | null;
  selectedCategoryName: string | null;
  categories: { items: readonly { id: string; name: string }[]; loading: boolean; error: string | null };
};

export function ManualExpenseForm({ state, onChange, onSave, onRetryCategories, onBack }: {
  state: ManualExpenseFormState;
  onChange: (patch: Partial<ManualExpenseDraft>) => void;
  onSave: () => void;
  onRetryCategories: () => void;
  onBack: () => void;
}) {
  const { availability, categories, draft, issues, saving, canSave, saveError, selectedCategoryName } = state;
  const { palette, fonts } = useAppTheme();
  const [categoryOpen, setCategoryOpen] = useState(false);
  if (availability === 'missing-space') {
    return (
      <Screen title="Add Expense">
        <BodyText>Choose a Space before adding an Expense.</BodyText>
      </Screen>
    );
  }

  if (availability === 'read-only') {
    return (
      <Screen title="Add Expense">
        <StackGap>
          <BodyText>This Space is read-only. Expenses cannot be added.</BodyText>
          <SecondaryButton label="Back" onPress={() => onBack()} />
        </StackGap>
      </Screen>
    );
  }

  if (availability === 'archived') {
    return (
      <Screen title="Add Expense">
        <StackGap>
          <BodyText>This Shared Space is archived. Expenses cannot be added; existing history remains available to inspect or copy.</BodyText>
          <SecondaryButton label="Back" onPress={() => onBack()} />
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
          onChangeText={(amount) => onChange({ amount })}
          error={issues.amount}
          placeholder="12.50"
          keyboardType="decimal-pad"
        />
        <TextField
          label="Description"
          value={draft.description}
          onChangeText={(description) => onChange({ description })}
          error={issues.description}
          placeholder="What was this Expense?"
        />
        <View style={{ gap: space.fieldLabelGap }}>
          <SupportingText>Category</SupportingText>
          <SecondaryButton
            label={selectedCategoryName ?? 'Choose Category'}
            selected={selectedCategoryName !== null}
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
          onChangeText={(expenseDate) => onChange({ expenseDate })}
          error={issues.expenseDate}
          placeholder="YYYY-MM-DD"
        />
        <SupportingText>Today in Manila is the suggested date. Added By is recorded by Spendeazy.</SupportingText>
        {categories.error ? (
          <StackGap>
            <BodyText>{categories.error}</BodyText>
            <SecondaryButton label="Retry Categories" onPress={onRetryCategories} />
          </StackGap>
        ) : null}
        {categories.loading ? <BodyText>Loading Categories.</BodyText> : null}
        {!categories.loading && !categories.error && categories.items.length === 0 ? (
          <BodyText>Add a Category in Budget before recording an Expense.</BodyText>
        ) : null}
        {saveError ? <BodyText>{saveError}</BodyText> : null}
        <PrimaryButton
          label={saveError ? 'Try again' : 'Save Expense'}
          onPress={onSave}
          busy={saving}
          disabled={!canSave}
        />
        <ChoiceSheet title="Category" visible={categoryOpen} onDismiss={() => setCategoryOpen(false)}>
          {categories.items.map((category) => (
            <SecondaryButton
              key={category.id}
              label={category.name}
              selected={category.id === draft.categoryId}
              onPress={() => {
                onChange({ categoryId: category.id });
                setCategoryOpen(false);
              }}
            />
          ))}
        </ChoiceSheet>
      </StackGap>
    </Screen>
  );
}
