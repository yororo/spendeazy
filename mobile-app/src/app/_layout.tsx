import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { palette, typeScale } from '@/constants/theme';
import { AppearanceGate, useAppTheme } from '@/navigation/app-theme';
import { observeAuthUser, useSessionSnapshot } from '@/application/session-runtime';

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

export default function RootLayout() {
  if (!publishableKey) return <ClerkConfiguration />;
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppearanceGate>
        <ThemedNavigation />
      </AppearanceGate>
    </ClerkProvider>
  );
}

function ThemedNavigation() {
  const { ready, scheme, palette: colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator ready={ready} />
    </View>
  );
}

function RootNavigator({ ready }: { ready: boolean }) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const session = useSessionSnapshot();

  useLayoutEffect(() => {
    if (!isLoaded) return;
    observeAuthUser(isSignedIn ? (userId ?? null) : null, isSignedIn ? (sessionId ?? null) : null);
  }, [isLoaded, isSignedIn, userId, sessionId]);

  useEffect(() => {
    if (isLoaded && ready) void SplashScreen.hideAsync();
  }, [isLoaded, ready]);

  if (!isLoaded || !ready) return null;
  const authenticated = isSignedIn === true && session.userId === userId && session.authSessionId === sessionId && session.notice === null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={authenticated} redirectTo="/(auth)/sign-in">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!authenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Screen name="parser-proof" />
    </Stack>
  );
}

function ClerkConfiguration() {
  return (
    <CenteredMessage>
      Google sign-in needs EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.
    </CenteredMessage>
  );
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.light.canvas,
        justifyContent: 'center',
        padding: 24,
      }}>
      <Text
        selectable
        style={{ color: palette.light.textPrimary, fontSize: typeScale.body }}>
        {children}
      </Text>
    </View>
  );
}
