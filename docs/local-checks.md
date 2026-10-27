# Automated local checks

For starting the API and mobile app and testing by hand, use [the local runbook](local-testing.md). These existing software checks remain useful independently of manual testing and do not establish native-device acceptance.

## API and isolated PostgreSQL

From the repository root:

```sh
node scripts/local-test-launcher.mjs --api-postgres
```

Requires Docker and installed API dependencies. The launcher creates a unique Compose project, random credentials/loopback port and one empty database per integration suite, including separate Dashboard Reporting and historical-migration databases. It runs the required unfiltered HTTP/PostgreSQL configuration and removes its own container/volume on completion or supported interruption. It leaves the manual database alone. Missing/shared test database URLs fail validation; see [API tests](../api/README.md#test).

Other API checks, from **`api/`**:

```sh
npm test -- --runInBand
npm run build
npm run openapi:check
npx eslint "{src,apps,libs,test}/**/*.ts"
```

The read-only ESLint invocation avoids `npm run lint`, which applies fixes.

## Mobile

From **`mobile-app/`**:

```sh
npm run parser:test
npm run lint
npm run typecheck
npm test
```

CI runs the same four checks. Parser fixtures are fictional. These commands do not install a build, sign in with Google or drive a device. Follow the manual runbook for native behavior and retain the release checks in [parser issue #138](https://github.com/yororo/spendeazy/issues/138).
