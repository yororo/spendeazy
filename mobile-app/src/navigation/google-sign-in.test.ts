import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeGoogleSignIn,
  googleSignInConfigurationMessage,
} from './google-sign-in.ts';

test('activates a Google session after a successful sign-in', async () => {
  let activated: string | null = null;
  const outcome = await completeGoogleSignIn(async () => ({
    createdSessionId: 'sess_1',
    setActive: async ({ session }) => {
      activated = session;
    },
  }));

  assert.equal(outcome, 'signed-in');
  assert.equal(activated, 'sess_1');
});

test('treats a dismissed Google prompt as cancellation', async () => {
  const outcome = await completeGoogleSignIn(async () => {
    throw { code: 'SIGN_IN_CANCELLED' };
  });
  assert.equal(outcome, 'cancelled');
});

test('treats an Android dismissal code as cancellation', async () => {
  const outcome = await completeGoogleSignIn(async () => {
    throw { code: '-5' };
  });
  assert.equal(outcome, 'cancelled');
});

test('keeps a failed Google sign-in retryable', async () => {
  const outcome = await completeGoogleSignIn(async () => {
    throw { code: 'NETWORK_ERROR', message: 'offline' };
  });
  assert.equal(outcome, 'failed');
});

test('names the missing Google client for this platform', () => {
  assert.match(
    googleSignInConfigurationMessage({
      os: 'android',
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: undefined,
      androidClientId: '  ',
    }) ?? '',
    /EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID/,
  );
  assert.equal(
    googleSignInConfigurationMessage({
      os: 'ios',
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: 'ios.apps.googleusercontent.com',
      androidClientId: undefined,
    }),
    null,
  );
});

test('does not sign in when Google returns no session', async () => {
  const outcome = await completeGoogleSignIn(async () => ({
    createdSessionId: null,
  }));
  assert.equal(outcome, 'failed');
});
