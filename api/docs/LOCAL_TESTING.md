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

## Account deletion recovery

Use only dedicated disposable Clerk identities for acceptance. Create Personal data, active/archived Shared history and multiple sessions first. Confirm `DELETE /api/v1/users/me` returns 202 with `Location: /api/v1/users/me/deletion`. The initiating valid session can GET exactly pending/completed with `Cache-Control: no-store`; another session receives a cleanup error. A 401, sign-out or provider outage does not prove completion. Test doubles establish HTTP/database behavior, not Clerk's real session-removal semantics.

The API starts the reconciler automatically. Stop/restart the API after acceptance to exercise durable recovery. During a provider outage Personal purge must still finish; fix configuration/connectivity rather than changing checkpoints. Inspect safe progress through a restricted database connection without selecting provider IDs, initiating session IDs, claim tokens, profile data or financial payloads:

```sql
SELECT user_id, status, accepted_at, personal_data_purged_at,
       sessions_revoked_at, provider_deleted_at, completed_at,
       attempt_count, next_attempt_at, claim_expires_at, last_failure_code
FROM account_deletion_operations
WHERE status = 'pending'
ORDER BY accepted_at;
```

Rows with due `next_attempt_at` and no live claim should be picked up at the next five-second poll. An unexpired claim can be running; let its two-minute lease expire after a crash. A growing attempt count/failure code indicates a continuing dependency problem. No maximum attempt count abandons work. After fixing the cause, ordinary automatic retries suffice. To expedite one known operation, bind its internal User ID as `$1` in a parameterized query:

```sql
UPDATE account_deletion_operations
SET next_attempt_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND status = 'pending'
  AND (claim_expires_at IS NULL OR claim_expires_at <= CURRENT_TIMESTAMP);
```

Never delete the old-identity fence, clear a live claim, fabricate checkpoints or mark an operation completed manually. Do not log raw Clerk errors or credentials. Completion requires all three independently persisted checkpoints. Verify SQL Personal removal and unchanged Shared originals/results, then separately verify provider absence and invalidity of all dedicated sessions, including one created during revoke/delete. Test a lost provider response and subsequent retry. Record Android and physical-iPhone evidence independently in the [IP-09 handoff](../../docs/agents/implementation/IP-09_Report.md); offline devices are not remotely erased.
