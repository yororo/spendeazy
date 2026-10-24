import { useState } from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import type { useManualExpense } from './use-manual-expense';

export function ManualExpenseForm({ controller, onBack, onSaved }: {
  controller: ReturnType<typeof useManualExpense>;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { active, categories, draft, issues, saving, saveError, activeCategories, selected, update, save } = controller;
  const { palette, fonts } = useAppTheme();
  const [categoryOpen, setCategoryOpen] = useState(false);
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
        <View style={{ gap: space.fieldLabelGap }}>
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
          onPress={() => void save().then((saved) => { if (saved) onSaved(); })}
          busy={saving}
          disabled={saving || categories.loading || activeCategories.length === 0}
        />
        <ChoiceSheet title="Category" visible={categoryOpen} onDismiss={() => setCategoryOpen(false)}>
          {activeCategories.map((category) => (
            <SecondaryButton
              key={category.id}
              label={category.name}
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
