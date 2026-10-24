import { Text } from 'react-native';

import { typeScale } from '@/constants/theme';
import { displayMoneyAmount } from '@/navigation/money-amount';
import { useAppTheme } from '@/navigation/app-theme';

export function MoneyAmount({ amount }: { amount: string }) {
  const { palette, fonts } = useAppTheme();
  const shown = displayMoneyAmount(amount);
  return (
    <Text
      selectable
      accessibilityLabel={`${shown} Philippine pesos`}
      style={{
        color: palette.textPrimary,
        fontFamily: fonts.medium,
        fontSize: typeScale.body,
        fontVariant: ['tabular-nums'],
      }}>
      {shown}
    </Text>
  );
}
