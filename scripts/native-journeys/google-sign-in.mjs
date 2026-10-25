const accountLabel = (process.env.SPENDEAZY_NV_GOOGLE_ACCOUNT_LABEL || '').replace(/\s+/g, ' ').trim();

const sessionExpiry = [
  { text: 'Your session expired. Sign in to continue.' },
  { text: 'Your session expired. Sign in again to continue.' },
];

const rejectedScreens = [
  ...sessionExpiry,
  { text: 'Unmatched Route' },
  { text: 'Page could not be found.' },
  { text: 'Personal Space is unavailable.' },
  { text: 'Sign in before using Spendeazy.' },
  { text: 'Could not reach Spendeazy. Check your connection and try again.' },
  { text: 'The API response could not be read. Try again.' },
  { text: 'The request could not be completed. Try again.' },
];

const failureLogs = [
  { source: 'device', includes: 'Maximum update depth' },
  { source: 'device', includes: 'FATAL EXCEPTION' },
  { source: 'metro', includes: 'Maximum update depth' },
];

const accountReason = accountLabel
  ? 'Complete the Google credential, consent, or MFA challenge for the dedicated development identity. Do not remove other Google accounts or app sessions.'
  : 'SPENDEAZY_NV_GOOGLE_ACCOUNT_LABEL is unset, so this journey will not choose an account. Select the dedicated development Google identity, or complete consent or MFA. Do not remove other Google accounts or app sessions.';

export default {
  id: 'google-sign-in',
  summary: 'Signs in from the Google sign-in screen with the dedicated development account, then waits until Personal Space has loaded and Dashboard stays up. An existing session is not sign-in proof. It does not clear Google accounts or other app sessions.',
  certifiesAuthenticatedSignIn: true,
  steps: [
    {
      id: 'google-sign-in-control',
      action: 'see',
      selector: { description: 'Sign in with Google' },
      missingReason: 'Google sign-in is not on screen. An existing session is not sign-in proof. Leave other Google accounts in place and sign out only the dedicated Spendeazy session, then run this journey again.',
      timeoutMs: 8000,
    },
    {
      id: 'no-session-expiry',
      action: 'absent',
      selector: sessionExpiry[0],
      timeoutMs: 600,
    },
    {
      id: 'open-google-chooser',
      action: 'tap',
      selector: { description: 'Sign in with Google' },
      timeoutMs: 5000,
    },
    {
      id: 'dedicated-account',
      action: 'tap-or-checkpoint',
      ...(accountLabel ? { selector: { text: accountLabel } } : {}),
      challenges: [
        { text: 'Enter your password' },
        { text: "Verify it's you" },
        { text: 'Verify it’s you' },
        { text: '2-Step Verification' },
        { text: 'Use your passkey' },
      ],
      reason: accountReason,
      timeoutMs: 20000,
    },
    {
      id: 'personal-space-settled',
      action: 'settle',
      selector: { text: 'Dashboard' },
      also: [{ text: 'Personal' }, { text: 'Active Space' }],
      gone: [{ text: 'Loading Spaces.' }],
      reject: rejectedScreens,
      failIfLog: failureLogs,
      holdMs: 2500,
      timeoutMs: 20000,
    },
    {
      id: 'dashboard-remains',
      action: 'see',
      selector: { text: 'Dashboard' },
      reject: rejectedScreens,
      timeoutMs: 5000,
    },
  ],
};
