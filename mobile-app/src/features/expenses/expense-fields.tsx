import type { ElementRef, RefObject } from 'react';
import { CalendarDays, ChevronDown, Pencil, Shapes } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { BrowseDateField } from '@/components/native-date-field';
import { TextField } from '@/components/text-field';
import { controlSize, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import type { ManualExpenseDraft, ManualExpenseField } from './manual-draft';

/** Shared presentation for manual creation and revision-protected editing. */
export function ExpenseFields({ categoryRef, categoryDisabled = false, draft, issues, categoryLabel, onChange, onOpenCategories, disabled = false, compact = false, nativeDatePicker = false }: {
  categoryRef?: RefObject<ElementRef<typeof View> | null>;
  categoryDisabled?: boolean;
  compact?: boolean;
  nativeDatePicker?: boolean;
  disabled?: boolean;
  draft: ManualExpenseDraft;
  issues: Partial<Record<ManualExpenseField, string>>;
  categoryLabel: string;
  onChange: (patch: Partial<ManualExpenseDraft>) => void;
  onOpenCategories: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <View style={{ gap: space.dialogGap }}>
      <View style={{ alignSelf: 'center', width: '100%', paddingVertical: compact ? 0 : 12 }}>
        <TextField
          label="Amount in Philippine pesos"
          showLabel={false}
          editable={!disabled}
          variant="amount"
          icon={<Text style={{ color: palette.textSecondary, fontFamily: fonts.medium, fontSize: 28 }}>₱</Text>}
          value={draft.amount}
          onChangeText={(amount) => onChange({ amount })}
          error={issues.amount}
          placeholder="0"
          keyboardType="decimal-pad"
        />
      </View>
      <View>
        <TextField
          label="Description (optional)"
          showLabel={false}
          editable={!disabled}
          variant="underlined"
          icon={<Pencil size={20} color={palette.textSecondary} />}
          value={draft.description}
          onChangeText={(description) => onChange({ description })}
          error={issues.description}
          placeholder="Description (optional)"
        />
        {nativeDatePicker ? <BrowseDateField label="Date" showLabel={false} disabled={disabled} value={draft.expenseDate} onChange={expenseDate => onChange({ expenseDate })} /> : <TextField
          label="Date"
          showLabel={false}
          editable={!disabled}
          variant="underlined"
          icon={<CalendarDays size={20} color={palette.textSecondary} />}
          value={draft.expenseDate}
          onChangeText={(expenseDate) => onChange({ expenseDate })}
          error={issues.expenseDate}
          placeholder="YYYY-MM-DD"
        />}
        {nativeDatePicker && issues.expenseDate ? (
          <Text accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.metadata }}>{issues.expenseDate}</Text>
        ) : null}
        <Pressable ref={categoryRef}
          accessibilityRole="button"
          accessibilityLabel={`Category: ${categoryLabel}`}
          onPress={onOpenCategories}
          disabled={disabled || categoryDisabled}
          accessibilityState={{ disabled: disabled || categoryDisabled }}
          style={{ minHeight: controlSize.field, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderColor: issues.categoryId ? palette.stateNegative : palette.fieldBorder }}>
          <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Shapes size={20} color={palette.textSecondary} />
          </View>
          <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: typeScale.body, color: palette.textPrimary, paddingVertical: 12 }}>
            {categoryLabel}
          </Text>
          <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <ChevronDown size={16} color={palette.textSecondary} />
          </View>
        </Pressable>
        {issues.categoryId ? (
          <Text accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.metadata }}>
            {issues.categoryId}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
