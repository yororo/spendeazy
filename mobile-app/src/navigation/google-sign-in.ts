export type GoogleAuthenticationFlowResult = {
  createdSessionId: string | null;
  setActive?: (params: { session: string }) => Promise<unknown>;
};

export type GoogleSignInConfiguration = {
  os: string | undefined;
  webClientId: string | undefined;
  iosClientId: string | undefined;
  androidClientId: string | undefined;
};

export function googleSignInConfigurationMessage(
  configuration: GoogleSignInConfiguration,
): string | null {
  if (!present(configuration.webClientId)) {
    return 'Google sign-in needs EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID.';
  }
  if (configuration.os === 'ios' && !present(configuration.iosClientId)) {
    return 'Google sign-in needs EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID.';
  }
  if (configuration.os === 'android' && !present(configuration.androidClientId)) {
    return 'Google sign-in needs EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID.';
  }
  return null;
}

export async function completeGoogleSignIn(
  start: () => Promise<GoogleAuthenticationFlowResult>,
): Promise<'signed-in' | 'cancelled' | 'failed'> {
  try {
    const result = await start();
    if (!result.createdSessionId || !result.setActive) return 'failed';
    await result.setActive({ session: result.createdSessionId });
    return 'signed-in';
  } catch (error) {
    return classifyGoogleSignInError(error) === 'cancelled' ? 'cancelled' : 'failed';
  }
}

function classifyGoogleSignInError(error: unknown): 'cancelled' | 'failed' {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  if (code === 'SIGN_IN_CANCELLED' || code === '-5') return 'cancelled';
  return 'failed';
}

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}
