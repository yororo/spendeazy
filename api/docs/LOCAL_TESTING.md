# Local API testing with Clerk

Use this runbook to validate real Clerk authentication. For credential-free browser/API/PostgreSQL acceptance, use [synthetic testing](../../docs/local-testing.md). Default automated suites use Clerk test doubles; [API test prerequisites](../README.md#test) cover database-dependent suites.

Commands run from `api/`. Examples use Bash; on Windows use Git Bash/WSL or equivalent PowerShell. Use a Clerk development instance. Keep secret keys, User/session IDs, and tokens outside commits and chat. Session tokens are short-lived; mint a fresh token when authentication starts returning `401`.

## 1. Start the configured API

Complete [API setup](../README.md#setup-and-run), including both database-backed encryption/hash keys, migrations, and Clerk settings. Web must use the same Clerk instance. `CLERK_AUTHORIZED_PARTIES` lists the frontend origins creating tokens, not the API origin unless it also serves the frontend.

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

### With the local frontend

Sign in with a User from the same development instance. In the browser console:

```js
await window.Clerk.session.getToken()
```

If `window.Clerk` is unavailable, use the frontend SDK's auth-hook `getToken()`. Set the returned value as `CLERK_SESSION_TOKEN` in your local shell. Requests send `Authorization: Bearer <session-token>`.

### Without a frontend

The existing helper creates an active session for a development User and mints its token. It requires a development-instance secret key, `curl`, and Node.js:

```bash
export CLERK_SESSION_TOKEN="$(./get-clerk-session-token.sh SECRET_KEY TEST_USER_ID)"
```

The helper writes only the token to stdout. Supply credentials locally; regenerate when the token expires.

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
| `401 Unauthorized` | Missing/malformed/expired token, wrong Clerk instance, `CLERK_JWT_KEY`, or frontend origin absent from `CLERK_AUTHORIZED_PARTIES` |
| `404 UserNotProvisionedError` | Call `PUT /api/v1/users/me` with the same identity |
| `404` during provisioning | Clerk User exists in the configured instance |
| `406` during provisioning | Primary verified email is usable |
| `503` during provisioning | `CLERK_SECRET_KEY` and Clerk connectivity |

Tests intentionally calling real Clerk stay separate from default suites: create a development User/session/token, send Bearer authentication, keep credentials outside the repository, and refresh expired tokens.

## Clerk references

- [Testing](https://clerk.com/docs/guides/development/testing/overview)
- [Postman/Insomnia](https://clerk.com/docs/guides/development/testing/postman-or-insomnia)
- [Authenticated requests](https://clerk.com/docs/guides/development/making-requests)
- [Session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
