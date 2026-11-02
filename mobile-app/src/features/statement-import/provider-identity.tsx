import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/navigation/app-theme';
import type { ImportAccount } from './import-model';

const providerLogos = {
  bdo: { source: require('../../../assets/providers/bdo.svg'), aspectRatio: 415.4375 / 145.15625 },
  eastwest: { source: require('../../../assets/providers/eastwest.webp'), aspectRatio: 330 / 66 },
  gcash: { source: require('../../../assets/providers/gcash.svg'), aspectRatio: 72 / 61 },
};

export function ProviderIdentity({ account, prominent = false }: { account: ImportAccount; prominent?: boolean }) {
  const { palette, fonts } = useAppTheme();
  const logo = providerLogos[account.provider];
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image source={logo.source} contentFit="contain" accessible={false} style={{ height: 18, aspectRatio: logo.aspectRatio }} />
      <Text style={{ flexShrink: 1, color: palette.textPrimary, fontFamily: prominent ? fonts.semibold : fonts.medium, fontSize: prominent ? 18 : 13 }}>{account.provider.toUpperCase()}</Text>
    </View>
    <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{account.format === 'e-wallet' ? 'E-wallet' : account.format.toUpperCase()}</Text>
  </View>;
}
