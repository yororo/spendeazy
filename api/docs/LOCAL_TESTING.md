# Local API testing with Clerk

Use this runbook for a focused real Clerk authentication check. Automated API suites use Clerk test doubles and isolated databases; the root [local-testing guide](../../docs/local-testing.md) covers required PostgreSQL suites and native mobile checks. The mobile Expense API client accepts an access-token provider, but the app has no Clerk sign-in flow or connected user journeys yet.

Commands run from `api/`. Examples use Bash; on Windows use Git Bash/WSL or equivalent PowerShell. Use a dedicated Clerk development instance and a dedicated disposable API database. Keep secret keys, User/session IDs, and tokens outside commits and chat. Session tokens are short-lived; mint a fresh token when authentication starts returning `401`.

## 1. Start the configured API

Complete [API setup](../README.md#setup-and-run), including database-backed encryption/hash keys, migrations, and the Clerk verification key and secret. The API authenticates native bearer sessions by their verified JWT signature, header type, validity window and User identity. It has no browser-origin allowlist and accepts native sessions without `azp`; see the [native session provenance decision](adr/0004-native-clerk-session-provenance.md).

Confirm readiness with `curl http://localhost:3000/health`. Public contract views are at `http://localhost:3000/docs` and `/docs-json`.

### Docker alternative

After setup/migrations, build from `api/`:

```bash
docker build -t spendeazy-api:local .
```

If PostgreSQL is on the host, use `host.docker.internal` instead of `localhost` in the container's `DATABASE_URL`, then start:

```bash
docker run --rm --name spendeazy-api \
  --env-file .env \
  -p 3000:3000 \
  spendeazy-api:local
```

Confirm `/health`; `Ctrl+C` stops the foreground container.

## 2. Obtain a development session token

The API includes a helper that creates an active session for a development User and mints its token. It requires a development-instance secret key, `curl`, and Node.js:

```bash
export CLERK_SESSION_TOKEN="$(./get-clerk-session-token.sh SECRET_KEY TEST_USER_ID)"
```

The helper writes only the token to stdout. Do not put the real secret key, User ID, or token in source control or shared logs.

## 3. Provision and verify the User

A valid Clerk identity must be linked to a local User before most private routes work:

```bash
curl -i -X PUT "http://localhost:3000/api/v1/users/me" \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

curl -i "http://localhost:3000/api/v1/users/me" \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN"
```

Initial provisioning returns `201`; later synchronization returns `200`. The Clerk profile needs a usable primary verified email. In Postman/Insomnia, select Bearer Token and paste only its value. `/docs` displays the contract; it is not an interactive API client.

## Troubleshooting

| Result | Check / next action |
| --- | --- |
| `401 Unauthorized` | Missing/malformed/expired token, wrong Clerk instance, `CLERK_JWT_KEY`, JWT header type or missing User identity |
| `404 UserNotProvisionedError` | Call `PUT /api/v1/users/me` with the same identity |
| `404` during provisioning | Clerk User exists in the configured instance |
| `406` during provisioning | Primary verified email is usable |
| `503` during provisioning | `CLERK_SECRET_KEY` and Clerk connectivity |

Keep tests calling real Clerk in a separate, explicitly configured suite.

## Clerk references

- [Testing](https://clerk.com/docs/guides/development/testing/overview)
- [Postman/Insomnia](https://clerk.com/docs/guides/development/testing/postman-or-insomnia)
- [Authenticated requests](https://clerk.com/docs/guides/development/making-requests)
- [Session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
