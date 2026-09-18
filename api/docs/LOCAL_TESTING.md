# Local API Testing with Clerk

All `/api/v1` endpoints require a valid Clerk session token except the public
health and documentation endpoints. Use the Clerk **development instance** for
local testing. Never commit Clerk secret keys, user IDs, session IDs, or tokens.

Clerk session tokens are short-lived (normally 60 seconds). Generate a fresh
token when a request starts returning `401 Unauthorized`.

## 1. Configure the API

Install dependencies and copy the example environment file:

```bash
npm install
cp .env.example .env
```

In the Clerk Dashboard, select the development instance and open **API keys**.
Add these values to `.env`:

```dotenv
# PEM-encoded JWKS public key from the Clerk development instance.
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Development-instance secret key. Required when PUT /users/me reads the
# signed-in user's profile from Clerk.
CLERK_SECRET_KEY=sk_test_...

# Frontend origins permitted by the API's Clerk token verifier.
CLERK_AUTHORIZED_PARTIES=http://localhost:5173
```

`CLERK_AUTHORIZED_PARTIES` must contain the origin of the frontend that creates
the token. Separate multiple origins with commas. It is not the API URL unless
the frontend itself is served from that origin.

Also configure `DATABASE_URL` and apply migrations. The migration command loads
`.env` itself:

```bash
npm run migration:run
```

Start the server with .env variables loaded
`npm run start:dev`

Confirm the public endpoints before testing authentication:

```bash
curl http://localhost:3000/health
```

The rendered OpenAPI contract is available at <http://localhost:3000/docs>, and
its machine-readable form is at <http://localhost:3000/docs-json>.

## Run with Docker

After configuring `.env` and applying the migrations above, build the local
image from the repository root:

```bash
docker build -t spendeazy-api:local .
```

If PostgreSQL runs on the host, change the hostname in `DATABASE_URL` from
`localhost` to `host.docker.internal` so it is reachable from the container.
Then start the API with all variables from `.env`:

```bash
docker run --rm --name spendeazy-api \
  --env-file .env \
  -p 3000:3000 \
  spendeazy-api:local
```

Confirm it is running with `curl http://localhost:3000/health`. Stop the
foreground container with `Ctrl+C`.

## 2. Get a development session token

### Preferred: use the local frontend

Sign in to the local frontend with a user in the same Clerk development
instance. In the browser developer console, run:

```js
await window.Clerk.session.getToken()
```

Copy the returned token. This is the same token the frontend should send in
cross-origin API requests:

```http
Authorization: Bearer <session-token>
```

If `window.Clerk` is unavailable, get the token through the frontend's Clerk
SDK (for example, `getToken()` from its auth hook).

### Without a frontend: use Clerk's Backend API

Use this only with a development-instance secret key. The script creates an
active session for an existing development user and then mints a short-lived
session token. It requires `curl` and Node.js.

From the repository root, run:

```bash
./get-clerk-session-token.sh SECRET_KEY TEST_USER_ID
```

The script writes only the token to standard output. To make it available to
subsequent Bash commands, export the captured result:

```bash
export CLERK_SESSION_TOKEN="$(./get-clerk-session-token.sh SECRET_KEY TEST_USER_ID)"
```

Do not paste the secret key or resulting token into chat or commit either one.
Generate a new token by running the script again when it expires.

## 3. Provision the signed-in user

A valid Clerk identity must be linked to a local user before most API routes can
be used. Provision or synchronize it first:

```bash
curl -i -X PUT "http://localhost:3000/api/v1/users/me" \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

The first request returns `201 Created`; later synchronizations return `200 OK`.
The Clerk user must have a primary verified email address.

Then verify the authenticated user:

```bash
curl -i "http://localhost:3000/api/v1/users/me" \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN"
```

In Postman or Insomnia, select Bearer Token authentication and paste only the
token value. The local `/docs` page displays the contract but is not an
interactive API client.

## Troubleshooting

- `401 Unauthorized`: the token is missing, malformed, expired, belongs to a
  different Clerk instance, or its frontend origin is absent from
  `CLERK_AUTHORIZED_PARTIES`.
- `404 UserNotProvisionedError`: call `PUT /api/v1/users/me` with the same token
  before using other protected routes.
- `404` while provisioning: the Clerk user no longer exists in the configured
  instance.
- `406` while provisioning: the Clerk profile has no usable primary verified
  email address.
- `503` while provisioning: check `CLERK_SECRET_KEY` and connectivity to Clerk.
- Public `/health` or `/docs` works but every protected request returns `401`:
  check `CLERK_JWT_KEY` and `CLERK_AUTHORIZED_PARTIES` in the API process.

## Automated tests

The repository's unit and end-to-end tests use test doubles and do not require
real Clerk credentials:

```bash
npm run test
npm run test:e2e
```

For tests that intentionally call a real Clerk development instance, follow
Clerk's testing flow: create a user, create a session, create a session token,
and send it as a Bearer token. Keep those tests separate from the default local
suite, store credentials outside the repository, and regenerate the token
before it expires.

## Clerk references

- [Testing with Clerk](https://clerk.com/docs/guides/development/testing/overview)
- [Testing with Postman or Insomnia](https://clerk.com/docs/guides/development/testing/postman-or-insomnia)
- [Making authenticated requests](https://clerk.com/docs/guides/development/making-requests)
- [Session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
