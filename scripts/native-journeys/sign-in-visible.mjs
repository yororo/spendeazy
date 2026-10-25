export default {
  id: 'sign-in-visible',
  summary: 'The signed-out launch screen shows Spendeazy and the Google sign-in control. It does not enter Google or certify an authenticated session.',
  steps: [
    {
      id: 'product-name',
      action: 'see',
      selector: { text: 'Spendeazy' },
      timeoutMs: 20000,
    },
    {
      id: 'google-sign-in',
      action: 'see',
      selector: { description: 'Sign in with Google' },
      timeoutMs: 5000,
    },
  ],
};
