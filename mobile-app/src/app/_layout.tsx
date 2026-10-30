import { ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { palette, typeScale } from '@/constants/theme';
import { AppearanceGate, useAppTheme } from '@/navigation/app-theme';
import { observeAuthUser, useSessionSnapshot, session as sessionOwner } from '@/application/session-runtime';
import { SecondaryButton } from '@/components/buttons';
import { BodyText, Screen } from '@/components/screen';
import { StatementExtractionHost } from '@/features/statement-import/extraction-host';
import { accountDeletion, setDeletionCredentials, useDeletionSnapshot } from '@/features/account-deletion/deletion-runtime';
import { DeletionStatusView } from '@/features/account-deletion/deletion-status-view';
import { useSessionTransport } from '@/application/authorized-client';

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
      <StatementExtractionHost />
    </View>
  );
}

function RootNavigator({ ready }: { ready: boolean }) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  const clerk = useClerk();
  const deletion = useDeletionSnapshot();
  const transport = useSessionTransport();
  const session = useSessionSnapshot();
  const bindingKey = JSON.stringify([userId, sessionId]);
  const [signOutFailure, setSignOutFailure] = useState<{ binding: string; message: string } | null>(null);
  const signOutError = signOutFailure?.binding === bindingKey ? signOutFailure.message : null;

  useLayoutEffect(() => {
    if (!isLoaded) return;
    setDeletionCredentials({
      binding: isSignedIn && userId && sessionId ? { userId, sessionId } : null,
      token: () => getToken(),
      current: () => clerk.user?.id === userId && clerk.session?.id === sessionId,
    });
    if (deletion.phase !== 'ready') return;
    if (!isSignedIn && sessionOwner.snapshot().ownerUserId) void sessionOwner.signOut().catch(() => {});
    observeAuthUser(isSignedIn ? (userId ?? null) : null, isSignedIn ? (sessionId ?? null) : null);
  }, [isLoaded, isSignedIn, userId, sessionId, getToken, clerk, deletion.phase]);

  useEffect(() => { void accountDeletion.initialize(); }, []);

  useEffect(() => {
    if (isLoaded && ready) void SplashScreen.hideAsync();
  }, [isLoaded, ready]);

  if (!isLoaded || !ready) return null;
  if (deletion.phase === 'loading') return <Screen title="Checking account"><BodyText>Checking private account recovery…</BodyText></Screen>;
  if (session.cleanupPending || session.cleanupError) return <Screen title="Private data cleanup">
    <BodyText>{session.cleanupPending ? 'Clearing private data…' : 'Private data cleanup failed. Retry before continuing.'}</BodyText>
    {session.cleanupError ? <SecondaryButton label="Retry private data cleanup" onPress={() => { void sessionOwner.retryCleanup().catch(() => {}); }} /> : null}
  </Screen>;
  if (deletion.phase !== 'ready') return <DeletionStatusView
    state={{ ...deletion, error: signOutError ?? deletion.error }}
    onCheck={() => { void accountDeletion.check(); }}
    onRetry={() => { void accountDeletion.submit(); }}
    onStorageRetry={() => { void accountDeletion.initialize(); }}
    onSignOut={() => {
      setSignOutFailure(null);
      void transport.signOut().catch(() => setSignOutFailure({ binding: bindingKey, message: 'Sign-out did not finish. Retry sign out.' }));
    }}
  />;
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
