# Focused API authentication checks

For ordinary mobile testing, follow [the shared local runbook](../../docs/local-testing.md). The app signs in with Google, obtains its Clerk session token and provisions the local User. No token helper or separate authentication startup is needed.

Use this page only when calling private endpoints directly from Postman, Insomnia or another HTTP client. Start the API/database through the runbook, using the same dedicated Clerk development instance and identity as the app.

## Send an authenticated request

Obtain a development **session token** using Clerk's supported [Backend API session/token operations](https://clerk.com/docs/reference/backend-api) or an existing signed-in development session's `getToken()` method. Keep tokens and secret keys local; sessions are short-lived, so obtain a fresh token after expiry. A Clerk testing token for bot protection is not a session bearer token. See [authenticated requests](https://clerk.com/docs/guides/development/making-requests).

In your HTTP client's Bearer Token field, enter the session token. Then call:

1. `PUT http://localhost:3000/api/v1/users/me` with JSON body `{}` to provision/synchronize the identity. First provisioning returns `201`; subsequent synchronization returns `200`.
2. `GET http://localhost:3000/api/v1/users/me` with the same bearer token to verify the local User.

The Clerk profile must have a usable primary verified email. The API verifies the token signature, header type, validity and User identity; native sessions can omit `azp`. See [native session provenance](adr/0004-native-clerk-session-provenance.md). The public `/docs` route displays the HTTP contract, not an interactive API client.

## Troubleshooting

| Result | Check |
| --- | --- |
| `401 Unauthorized` | Missing/malformed/expired session token, wrong Clerk instance, or API verification key |
| `404 UserNotProvisionedError` | Call `PUT /api/v1/users/me` with the same identity |
| `404` during provisioning | Identity exists in the configured Clerk instance |
| `406` during provisioning | Primary verified email is usable |
| `503` during provisioning | API secret key and Clerk connectivity |

Existing automated API suites use Clerk test doubles and isolated databases; see [local checks](../../docs/local-checks.md). A manually minted token checks API authentication and does not establish native Google sign-in behavior.
