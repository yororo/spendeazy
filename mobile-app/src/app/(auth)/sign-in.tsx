import { useSignInWithGoogle } from '@clerk/expo/google';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSignInTransition } from '@/features/auth/sign-in-transition';
import { SignInBackground } from '@/features/auth/sign-in-background';
import { SignInBrandScene } from '@/features/auth/sign-in-brand-scene';
import { space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import {
  completeGoogleSignIn,
  googleSignInConfigurationMessage,
} from '@/navigation/google-sign-in';
import { useSessionTransport } from '@/application/authorized-client';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { begin, finish } = useSignInTransition();
  useEffect(() => finish, [finish]);
  const { palette, fonts } = useAppTheme();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const { prepareSignIn } = useSessionTransport();
  const [phase, setPhase] = useState<'ready' | 'loading' | 'success' | 'cancelled' | 'failed'>('ready');
  const [failure, setFailure] = useState<string | null>(null);
  const configurationMessage = googleSignInConfigurationMessage({
    os: process.env.EXPO_OS,
    webClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID,
  });

  async function signIn() {
    if (phase === 'loading' || phase === 'success') return;
    if (configurationMessage) {
      setFailure(configurationMessage);
      setPhase('failed');
      return;
    }
    begin();
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
    if (outcome === 'signed-in') {
      setPhase('success');
      finish();
      return;
    }
    finish();
    setPhase(outcome);
    if (outcome === 'failed') setFailure('Google sign-in failed. Try again.');
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.canvas,
      }}>
      <SignInBackground />
      <ScrollView scrollEnabled={phase !== 'success'} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} style={{ flex: 1 }} contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + space.dialogInset,
        paddingBottom: insets.bottom + space.screenBottom,
        paddingHorizontal: space.screenHorizontal,
        justifyContent: 'center',
        gap: space.dialogGap * 2,
      }}>
        <SignInBrandScene onPress={() => void signIn()} busy={phase === 'loading'} signedIn={phase === 'success'} />
          {failure ? (
            <Text accessibilityLiveRegion="polite" selectable style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: typeScale.body, textAlign: 'center' }}>
              {failure}
            </Text>
          ) : null}
      </ScrollView>
    </View>
  );
}
