import { Image } from 'expo-image';
import { Wallet } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/navigation/app-theme';
import type { ImportAccount } from './import-model';

const providerLogos = {
  bdo: { source: require('../../../assets/providers/bdo.svg'), aspectRatio: 415.4375 / 145.15625 },
  eastwest: { source: require('../../../assets/providers/eastwest.webp'), aspectRatio: 330 / 66 },
  gcash: { source: require('../../../assets/providers/gcash.svg'), aspectRatio: 330 / 79 },
};

const providerNames = { bdo: 'BDO', eastwest: 'EastWest', gcash: 'GCash' };
const networkLogos = {
  amex: { source: require('../../../assets/providers/amex.svg'), aspectRatio: 1, label: 'AMEX' },
  visa: { source: require('../../../assets/providers/visa.webp'), aspectRatio: 3840 / 1247, label: 'VISA' },
};
export function ProviderIdentity({ account, showName = true, networkPlacement = 'adjacent', logoHeight = 18 }: {
  account: ImportAccount; showName?: boolean; networkPlacement?: 'adjacent' | 'trailing'; logoHeight?: number;
}) {
  const { palette, fonts } = useAppTheme();
  const logo = providerLogos[account.provider];
  const network = account.statementType === 'credit-card' ? networkLogos[account.format] : null;
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: networkPlacement === 'trailing' ? 'space-between' : 'flex-start', gap: 8 }}>
      <Image source={logo.source} contentFit="contain" accessible={false} style={{ height: logoHeight, aspectRatio: logo.aspectRatio }} />
      {network ? <Image source={network.source} contentFit="contain" accessible accessibilityLabel={network.label} style={{ height: logoHeight, aspectRatio: network.aspectRatio }} />
        : account.statementType === 'e-wallet' ? <Wallet size={logoHeight} color={palette.textSecondary} accessibilityLabel="E-wallet" accessible /> : null}
    </View>
    {showName ? <Text style={{ color: palette.textSecondary, fontFamily: fonts.medium, fontSize: 13 }}>{`${providerNames[account.provider]} ${account.format === 'e-wallet' ? 'E-wallet' : account.format.toUpperCase()}`}</Text> : null}
  </View>;
}
