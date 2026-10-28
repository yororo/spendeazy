import { Text } from 'react-native';

import { typeScale } from '@/constants/theme';
import { displayMoneyAmount } from '@/navigation/money-amount';
import { useAppTheme } from '@/navigation/app-theme';

export function MoneyAmount({ amount, variant = 'body' }: { amount: string; variant?: 'body' | 'row' | 'total' }) {
  const { palette, fonts } = useAppTheme();
  const shown = displayMoneyAmount(amount);
  return (
    <Text
      selectable
      accessibilityLabel={`${shown} Philippine pesos`}
      style={{
        color: palette.textPrimary,
        fontFamily: variant === 'total' ? fonts.semibold : fonts.medium,
        fontSize: variant === 'total' ? 42 : variant === 'row' ? 15 : typeScale.body,
        letterSpacing: variant === 'total' ? -2 : 0,
        fontVariant: ['tabular-nums'],
      }}>
      {shown}
    </Text>
  );
}
