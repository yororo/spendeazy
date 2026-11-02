import { useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { CalendarRange, ChevronDown } from 'lucide-react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { SecondaryButton } from '@/components/buttons';
import { controlSize, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function BrowseDateField({ label, value, onChange, disabled = false, showLabel = true }: {
  disabled?: boolean;
  showLabel?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { palette, scheme, fonts } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState(new Date());
  const parts = value.split('-').map(Number);
  const dateLabel = value ? new Date(parts[0], parts[1] - 1, parts[2], 12).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Any date';
  return <View style={{ gap: space.fieldLabelGap }}>
    {showLabel ? <Text style={{ color: palette.textSecondary, fontFamily: fonts.medium, fontSize: typeScale.metadata }}>{label}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={label + ': ' + dateLabel} disabled={disabled} accessibilityState={{ expanded: open, disabled }} style={({ pressed }) => ({ minHeight: controlSize.field, flexDirection: 'row', alignItems: 'center', gap: space.cardGap, borderBottomWidth: 1, borderColor: palette.fieldBorder, paddingVertical: space.fieldLabelGap, opacity: pressed ? 0.55 : 1 })} onPress={() => {
      const parts = value.split('-').map(Number);
      const date = value ? new Date(parts[0], parts[1] - 1, parts[2], 12) : new Date();
      setPickerValue(Number.isNaN(date.getTime()) ? new Date() : date);
      Keyboard.dismiss();
      setOpen(true);
    }}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><CalendarRange size={20} color={palette.brandPrimary} /></View>
      <Text style={{ flex: 1, color: value ? palette.textPrimary : palette.textSecondary, fontFamily: fonts.medium, fontSize: typeScale.body }}>{dateLabel}</Text>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><ChevronDown size={18} color={palette.textSecondary} /></View>
    </Pressable>
    {open ? <DateTimePicker
      value={pickerValue}
      mode="date"
      presentation={Platform.OS === 'android' ? 'dialog' : 'inline'}
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      themeVariant={scheme}
      accentColor={palette.brandPrimary}
      onDismiss={() => setOpen(false)}
      onValueChange={(_, date) => {
        setPickerValue(date);
        onChange([date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'));
        if (Platform.OS === 'android') setOpen(false);
      }}
    /> : null}
    {open && Platform.OS === 'ios' ? <SecondaryButton label="Done" onPress={() => setOpen(false)} /> : null}
  </View>;
}
