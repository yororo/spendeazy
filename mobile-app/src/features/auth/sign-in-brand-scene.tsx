import { Image, StyleSheet, Text, View } from 'react-native';
import { LogIn } from 'lucide-react-native';

import { PrimaryButton } from '@/components/buttons';
import { space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

/** Plain product logo, identity, and a distinct primary sign-in action. */
export function SignInBrandScene({ onPress, busy = false, signedIn = false }: {
  onPress: () => void;
  busy?: boolean;
  signedIn?: boolean;
}) {
  const { palette, fonts } = useAppTheme();

  return <View style={styles.hero}>
    <Image source={require('../../../assets/design/oV7Mn.png')} resizeMode="contain" accessible={false} style={styles.logo} />
    <View style={styles.identity}>
      <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.pageTitle, letterSpacing: typeScale.pageTitleTracking, textAlign: 'center' }}>
        Spendeazy
      </Text>
      <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.body, textAlign: 'center' }}>
        Spend smarter. Spend easier.
      </Text>
    </View>
    <View style={styles.action}>
      <PrimaryButton
        label={signedIn ? 'Signed in' : busy ? 'Signing in…' : 'Sign in'}
        accessibilityLabel={signedIn ? 'Signed in' : busy ? 'Signing in with Google' : 'Sign in with Google'}
        icon={LogIn}
        onPress={onPress}
        disabled={signedIn}
        busy={busy}
        showSpinner={busy}
      />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { width: '100%', alignItems: 'center', paddingVertical: space.dialogInset, gap: space.dialogGap },
  identity: { width: '100%', gap: space.fieldLabelGap },
  action: { width: '100%' },
  logo: { width: 72, height: 82 },
});
