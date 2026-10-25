# Simplifying local manual mobile testing

Implementation follow-up: the user accepted the simpler manual workflow and retirement of the managed framework. See [the current runbook](../local-testing.md) and [the decision](../adr/0006-standard-local-manual-testing.md). The inventory/proposed filenames below describe the pre-change checkout, not current startup instructions.

Research date: 2026-10-25 (Asia/Manila). Repository inspected at `3d86f5b`, initially clean. This is an analysis and proposed workflow, not an implemented replacement or device-test result.

## Recommendation

Yes: substantially simplify the default **manual** workflow to Docker Compose for PostgreSQL, the existing Nest/TypeORM npm commands for the API, and Expo CLI for the native app. Prefer a persistent, explicitly disposable development database over a fresh randomized environment on every launch. Keep configuration in the ordinary project-local environment files. Use a short manual checklist for behavior and evidence.

Do not make eliminating all custom code the goal. Keep application-specific asset generation, guarded seed/reset operations, migration safety, and isolated automated database testing. Separate any retained agent verification from the manual setup; these serve different requirements.

The current framework was intentional. [Issue #180](https://github.com/yororo/spendeazy/issues/180) describes stale builds/configuration, competing Metro/API instances, failures after briefly displaying Dashboard, and the user becoming the agent's emulator operator. It explicitly requested owned resources, run-scoped configuration, provenance, resumable native journeys, and structured reports. [Issue #185](https://github.com/yororo/spendeazy/issues/185) requested refresh and cache correctness. Standard launch commands do not reproduce those guarantees. Retiring that capability would change the earlier requirements; making it optional for manual testing does not inherently require retiring it.

## Repository findings

The inspected surface includes `docs/local-testing.md`, both project guides and READMEs, `api/docs/LOCAL_TESTING.md`, all three local Compose files, both API launchers, the native verification lifecycle/launch/journey modules, journey definitions, package scripts, Dockerfile, environment loaders, mobile config, parser bundler, and migration runner.

| Existing surface | Assessment for manual testing |
| --- | --- |
| `scripts/run-disposable-api.sh` + `local-test/disposable-api.compose.yml` | Useful zero-host-Node demo/smoke workflow, but random ports, temporary keys, image lifecycle and automatic data destruction are poor defaults for repeated mobile testing. |
| `scripts/native-verification.mjs` | 1,359 lines for lifecycle, ownership, secret handling, state and reporting. Much duplicates standard Compose operations, but stronger ownership checks are deliberate. |
| `scripts/native-verification-launch.mjs` | 1,791 lines for Android tools, detached Metro management, fingerprints, bundle verification, build/cache handling, refresh and evidence. Excessive as a prerequisite to a human opening the app. |
| `scripts/native-verification-journey.mjs` | 848 lines implementing UI XML parsing, selectors, taps, waits, checkpoints and reporting. This is an automation framework, not manual setup. |
| Two native verification test files | 2,378 lines combined, in addition to those 3,998 implementation lines. Line counts show maintenance surface, not proof of defects or exact achievable deletion. |
| `scripts/local-test-launcher.mjs` | Distinct automated PostgreSQL isolation concern. Do not remove as collateral simplification. |
| API npm scripts | `start:dev` already runs Nest watch mode; `migration:run` already uses TypeORM's ts-node CLI. These are appropriate thin aliases. |
| Mobile npm scripts | `android`/`ios` start Metro and open the platform; they do not build a new native binary. Distinguish them from `expo run:android`/`run:ios`. |

The manual Docker and managed verification stacks overlap, but differ materially in database lifetime and ownership. The managed stack uses the PostgreSQL container's network namespace for the API and publishes both ports there. That supports its ownership model; ordinary Compose service networking would be easier for a human to inspect.

Several documents are stale: the root guide says the mobile app has no configured API integration, the API README says it is not an authenticated API client, and the Clerk runbook says there is no sign-in flow. Current mobile documentation/code has native Google sign-in and connected Spaces/Expense workflows. Resolve these contradictions before adding more setup instructions.

## What official tooling replaces

### Expo and React Native

Expo's documented local flow is `npx expo run:android` to generate native projects when absent, compile, install and start Metro; use `--device` for selection. Reuse the installed development binary with `npx expo start --dev-client` for JavaScript work. Expo CLI provides interactive reload and device controls. This can replace the manual need for detached Metro launchers, PID files, custom reload requests, and most install orchestration. [Local development](https://docs.expo.dev/guides/local-app-development/), [CLI reference](https://docs.expo.dev/more/expo-cli/).

Use `mobile-app/.env.local`. Expo loads standard environment files and inlines statically referenced `process.env.EXPO_PUBLIC_*` values. JavaScript environment edits require a full reload, not a native rebuild, CLI restart or cache clear. The API URL and publishable key currently use that supported access pattern. The custom launcher instead disables dotenv and makes these launch-configuration changes trigger native rebuild handling: conservative for provenance, unnecessary for ordinary manual iteration. Keep secrets out of public variables. [Environment variables](https://docs.expo.dev/guides/environment-variables/).

Rebuild for native dependency/plugin changes and native settings such as the iOS Google URL scheme. Because generated native directories may already exist, rerunning `run:android` alone must not be assumed to reapply every app-config/plugin change. Follow CNG regeneration guidance, using `expo prebuild --clean` when appropriate for this repository's generated projects, then rebuild. Do not routinely clean native projects or Gradle caches for JavaScript changes. [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/).

Keep development builds. This app's Clerk native Google integration requires one; Expo Go is not a valid simplification. Keep EAS development builds for physical iPhone from Windows; local iOS builds require macOS/Xcode. Ad hoc iPhone installation requires registered devices and provisioning. The existing preview profile is useful for milestone tests without Metro. [Clerk Google native setup](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google), [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

Drop the bespoke APK cache from the manual path. Start with normal incremental native builds. If measured build time remains a problem, evaluate Expo's supported fingerprint/build cache rather than maintaining an independent fingerprint policy; it adds setup and has platform limits, so it is not the first step. [Expo build caching](https://docs.expo.dev/guides/cache-builds-remotely/).

### Docker, Nest and TypeORM

Compose already provides project scoping, `up --wait`, health checks, `ps`, `logs`, `exec`, `stop`, and `down`. Named volumes survive ordinary teardown; `down --volumes` explicitly destroys them. Project names support parallel environments, but are not equivalent to the framework's ownership-token checks against stale/replaced resources. Use one explicit manual project per checkout and configurable ports; never silently terminate a busy listener. [Project names](https://docs.docker.com/compose/how-tos/project-name/), [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/), [Compose down](https://docs.docker.com/reference/cli/docker/compose/down/).

The smallest active-development setup runs only PostgreSQL in Compose and the API on the host. Existing `npm run start:dev` uses `nest start --env-file=.env --watch`; existing `npm run migration:run` uses the official TypeORM ts-node pattern. Run in `api/` so environment paths resolve correctly. Migrations are explicit; database options have `migrationsRun: false`. Do not substitute schema synchronization. [Nest CLI](https://docs.nestjs.com/cli/usages), [TypeORM migrations](https://typeorm.io/docs/migrations/executing/).

An all-container alternative can still be simple: a Compose `build`, PostgreSQL healthcheck, migration service, and API depending on successful migration completion. Standard service DNS lets the API use `postgres:5432` rather than sharing the database network namespace. Keep the existing compiled migration runner: its advisory lock, schema check and redacted errors have value beyond command orchestration. [Startup ordering](https://docs.docker.com/compose/how-tos/startup-order/), [Compose networking](https://docs.docker.com/compose/how-tos/networking/).

Do not recommend Compose Watch as a drop-in. The current production Dockerfile copies compiled output and prunes development dependencies. Source syncing cannot run TypeScript watch mode in that image. Watch needs a development target/command or rebuild rules, with host `node_modules` excluded. Host Nest watch is simpler initially. [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/).

Compose Ctrl+C stops attached containers; it does not reproduce automatic removal of resources/images/data. `--wait` uses detached mode. Explicit teardown is a reasonable manual tradeoff and improves data retention, but must be documented honestly.

### Clerk

Use one dedicated Clerk development instance shared by mobile and API and a real dedicated Google identity. Google client IDs, signing configuration and iOS URL schemes remain necessary. Clerk is hosted: CLI commands do not provide a local authentication emulator. [Native Google setup](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google).

The official CLI can help with linking, environment retrieval and diagnostics. It is optional setup tooling, not another daily service. Do not rerun scaffolding against the established integration or pull backend secrets blindly into mobile configuration. The API's PEM verification key and project-specific crypto keys still need deliberate configuration. [Clerk CLI](https://clerk.com/docs/cli).

`api/get-clerk-session-token.sh` is only needed for focused API-client checks, not normal mobile testing: the app already obtains its session token. Consider replacing that helper with the documented Postman/Insomnia flow or supported CLI session/API operations after verifying the installed CLI commands. Neither token minting, impersonation nor testing-token bot bypass proves that native Google sign-in works. Do not introduce an authentication bypass for manual convenience. [Postman/Insomnia](https://clerk.com/docs/guides/development/testing/postman-or-insomnia), [Clerk testing](https://clerk.com/docs/guides/development/testing/overview).

## Accepted workflow

The proposed manual workflow is implemented in [the local runbook](../local-testing.md). It uses the root `compose.yaml`, host Nest watch mode and Expo CLI, retaining data until explicit reset. Refer there for current commands rather than the pre-change inventory in this report.

## What should remain custom

- `parser:prepare`: creates a self-contained PDF.js/WebView artifact with workers/resources and licenses. Expo does not generate that product-specific bundle. Preserve the EAS hook; consider thin local lifecycle hooks to ensure generation happens before first start/build.
- The Windows CMake path config plugin: a native build accommodation, not a launch wrapper. Remove only after a clean Windows build demonstrates it is unnecessary.
- Guarded fictional seed/reset logic: Docker and TypeORM do not know the project's identity/data/authorization semantics. Seeded synthetic users do not substitute for the real signed-in development user.
- Compiled migration locking/redaction and application configuration validation.
- Required automated test isolation and project regression tests. Reworking nine isolated integration databases is a separate task with separate correctness criteria.

## Manual mobile testing quality

A simpler launcher can improve repeatability by making services and configuration visible. It does not improve coverage automatically. Use a short checklist appropriate to the change:

- Fresh signed-out Google sign-in, cancellation/retry, provisioning and settled Personal Space; explicit sign-out and identity isolation.
- Cold process restart without clearing app data, retained session and Space; background/foreground and recovery.
- API unavailable/retry and session-expiry behavior; Space changes; fictional Expense create/list/detail.
- Native back/keyboard, appearance/text scaling/accessibility; document selection, parser lifecycle and cleanup when relevant.

Keep daily development testing separate from milestone preview/release-build checks on real devices. Component tests do not exercise all native backing code, and development builds do not establish release performance. Record revision/dirty status, native build/profile, API configuration identity without secrets, device/OS, tested steps and outcomes. A full-reload log or bundle hash is provenance evidence, not proof of product behavior. [React Native testing](https://reactnative.dev/docs/testing-overview), [Running on device](https://reactnative.dev/docs/running-on-device).

Preserve Android and physical-iPhone acceptance and the specific parser measurements/older-device/cleanup gate in [issue #138](https://github.com/yororo/spendeazy/issues/138). Do not add offline/traffic-capture acceptance: that issue explicitly records its removal.

If repeatable UI automation is later needed, pilot Maestro rather than expanding the custom XML/tap/wait language. Expo documents Maestro workflows; Maestro supplies native UI-driving commands. It is an optional automation migration, not necessary manual setup. Verify current Windows/Android emulator compatibility, Google chooser interaction, human credential checkpoints, cold-start semantics and private artifact handling before claiming parity. It will not replace ownership/provenance reporting by itself. [Expo Maestro example](https://docs.expo.dev/eas/workflows/examples/e2e-tests/), [Maestro installation](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli).

## Migration order and limits

1. Establish the short manual runbook and development PostgreSQL Compose configuration. Fix contradictory integration statements. Make configuration and data lifetime consistent.
2. Demonstrate from a fresh checkout on Windows: build/install, real sign-in, settled authenticated data, JS/environment refresh, API edit/restart, cold session restoration, retained database and intentional reset. Demonstrate the physical-iPhone path separately.
3. Remove disposable manual launcher/Compose duplication if its zero-host-Node use case is not wanted. If wanted, keep it as an optional Docker profile/recipe, preferably declarative.
4. Keep managed verification outside the manual quick start. Decide whether to retain it, narrow it or replace it based on agent verification requirements, not script count. Delete related modules/tests only after equivalent requirements are addressed or explicitly retired; do not simply rename it legacy and keep requiring it.
5. Consider a Maestro pilot only if automated device coverage has clear value. Avoid replacing one custom manager with a new general task runner or unnecessary dependency stack.

High confidence: standard commands substantially simplify the manual entry point. Moderate confidence: broad framework deletion can preserve everything users currently value; that depends on whether #180's autonomous verification guarantees remain required. No runtime experiment, install, build, migration, emulator interaction or performance benchmark was performed for this research. No exact deletion percentage or drop-in compatibility claim is made.
