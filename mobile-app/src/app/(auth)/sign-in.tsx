import { useSignInWithGoogle } from '@clerk/expo/google';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/buttons';
import { CanvasBackground, DesignSurface } from '@/components/design-surface';
import { ScreenHeader } from '@/components/screen-header';
import { space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import {
  completeGoogleSignIn,
  googleSignInConfigurationMessage,
} from '@/navigation/google-sign-in';
import { useSessionSnapshot } from '@/application/session-runtime';
import { useSessionTransport } from '@/application/authorized-client';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { palette, fonts } = useAppTheme();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const { prepareSignIn } = useSessionTransport();
  const session = useSessionSnapshot();
  const [phase, setPhase] = useState<'ready' | 'loading' | 'cancelled' | 'failed'>('ready');
  const [failure, setFailure] = useState<string | null>(null);
  const configurationMessage = googleSignInConfigurationMessage({
    os: process.env.EXPO_OS,
    webClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID,
  });

  async function signIn() {
    if (configurationMessage) {
      setFailure(configurationMessage);
      setPhase('failed');
      return;
    }
    setPhase('loading');
    setFailure(null);
    const outcome = await completeGoogleSignIn(async () => {
      await prepareSignIn();
      const result = await startGoogleAuthenticationFlow();
      return {
        createdSessionId: result.createdSessionId,
        setActive: result.setActive
          ? async ({ session: sessionId }) => {
              await result.setActive?.({ session: sessionId });
            }
          : undefined,
      };
    });
    if (outcome === 'signed-in') return;
    setPhase(outcome);
    if (outcome === 'failed') setFailure('Google sign-in failed. Try again.');
  }

  const label = phase === 'loading' ? 'Signing in' : phase === 'failed' ? 'Retry' : 'Sign in with Google';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.canvas,
      }}>
      <CanvasBackground />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + space.dialogInset,
        paddingBottom: insets.bottom + space.screenBottom,
        paddingHorizontal: space.screenHorizontal,
        justifyContent: 'center',
        gap: space.cardGap,
      }}>
        <ScreenHeader title="Welcome to Spendeazy" />
        <DesignSurface style={{ padding: space.dialogInset, gap: space.dialogGap }}>
          {session.notice === 'expired' ? (
            <Text selectable style={{ color: palette.textPrimary, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              Your session expired. Sign in to continue.
            </Text>
          ) : (
            <Text selectable style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              Sign in with Google to open your Personal Space.
            </Text>
          )}
          {phase === 'cancelled' ? (
            <Text selectable style={{ color: palette.textPrimary, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              Sign-in cancelled.
            </Text>
          ) : null}
          {failure ? (
            <Text selectable style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              {failure}
            </Text>
          ) : null}
          <PrimaryButton label={label} onPress={() => void signIn()} busy={phase === 'loading'} />
        </DesignSurface>
      </ScrollView>
    </View>
  );
}
