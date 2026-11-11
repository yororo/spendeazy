# Cloud validation setup — November 11, 2026

Historical evidence from the initial environment setup. For the portable follow-up workflow, see [reusable cloud setup](LOCAL_TESTING_CLOUD.md).

Baseline: `8f3615a`, with an API lockfile repair adding the two missing optional transitive entries `@emnapi/core@1.11.3` and `@emnapi/runtime@1.11.3`. No application behavior was changed.

## Verified checks

| Check | Result |
| --- | --- |
| API read-only ESLint | Passed |
| API production build | Passed |
| API unit tests | 56 suites, 330 tests passed |
| HTTP/PostgreSQL integration tests | 20 suites, 152 tests passed; ten isolated databases |
| OpenAPI contract consistency | Passed |
| Mobile lint | Passed with Expo telemetry disabled |
| Mobile TypeScript | Passed |
| Mobile application/component tests | 290 passed |
| Statement parser fixtures | 7 passed |
| Release gates/planner verification | Passed |
| Android production export | Passed; Hermes bundle and assets written to `/workspace/android-export` |
| Production migration image (cloud CA adaptation) | Passed; 30 migrations, concurrent/repeat runs, invalid-credential failure |
| Android debug APK compilation | Blocked by Google Maven HTTP 503 after 32 Gradle tasks; no APK produced |
| Android prebuild | Passed; generated ignored native project; restored Expo's package script rewrites |
| API live startup | Health returned `{"status":"ok","database":"ready"}`; unauthenticated profile request returned 401 |

Initial checks used the image's Node 24.19.0. Installed the repository's pinned Node 24.11.1 and repeated the standard checks using the reusable runner. All standard checks passed on that version after correcting disposable database reset behavior.

## Reusable environment

- Run `/workspace/validate-project.sh`; per-check logs are in `/workspace/validation-logs`, and the final baseline run output is in `final-results.txt` there. The runner returns nonzero if any check fails.
- Read `/workspace/validation-README.md` for dependency installation, optional Android/image commands, and cleanup.
- Source `/workspace/cloud-validation-env.sh` for pinned Node, writable npm/Gradle caches, SDK paths, CI mode, and disabled Expo telemetry.
- The dedicated Docker container `spendeazy-cloud-tests` listens on `127.0.0.1:55434`. Each required suite gets a separate disposable database. Tests do not use the manual Compose database or the supplied deployment database URL.
- These setup scripts and tools live in this workspace; they are not a published reusable cloud image. Preserve them with the environment or reproduce their setup in a new environment.

## Challenges and workarounds

1. Clean API install initially failed because the committed lockfile lacked two transitive entries. Added those entries without changing package versions or unrelated lock metadata, then verified `npm ci` compatibility.
2. Expo telemetry tried to create files in the read-only home directory. `EXPO_NO_TELEMETRY=1` resolved mobile lint/export setup without changing the application.
3. Docker Buildx needs writable `~/.docker` state; image checks require execution outside the filesystem sandbox.
4. Container dependency installation needs the cloud CA. A temporary `/workspace/Dockerfile.cloud` mounts it as a BuildKit secret, and `/workspace/cloud-bin/docker` supplies that secret to the existing migration-image test. TLS verification remains enabled. This tests a cloud-adapted build, not the unmodified Dockerfile.
5. Gradle does not automatically use the shell's HTTP proxy variables. Added explicit proxy and system Java trust-store settings to the workspace Gradle cache.
6. React Native Gradle plugin compilation needs JDK 17 in addition to the image's JDK 21. Automatic toolchain download was blocked by the proxy; installed Oracle JDK 17.0.12 from its official archive and registered it locally. This is a development toolchain workaround, not an application runtime dependency.
7. The generated Expo project requires SDK Platform 37.0, Build Tools 37.0.0, and NDK 27.1.12297006; installed all three in addition to the initially installed SDK 36.
8. The host exposes no KVM device or CPU virtualization flags. The software Android emulator never became usable during these checks and was stopped. Native UI sign-in, expense entry/screenshots, device performance, and iOS validation remain unverified.
9. The historical migration test needs a fresh empty database on every run. The helper now recreates only its ten dedicated suite databases before each integration run.
10. Concurrent installs, container extraction, Hermes compilation, and Kotlin compilation compete for three available CPU cores. Use sequential routine checks and retain caches for later changes. Some tests intentionally emit error logs while testing failure handling; exit status and test totals determine pass/fail.

## Native compilation outcome

After resolving toolchain setup, `:app:assembleDebug` executed 32 Gradle tasks but failed resolving the runtime classpath. The first reported cause was HTTP 503 fetching `com.google.mlkit:common:18.11.0` from `https://dl.google.com/dl/android/maven2/`; Gradle then disabled that repository and reported 142 related dependency failures. A fresh curl request to the exact POM also returned HTTP 503 with an upstream connection failure. This is an observed dependency-fetch blocker; native app compilation and APK generation are not established. No alternate repository or TLS bypass was used. The failed build took 6 minutes 25 seconds after the JDK/toolchain correction.

## Final state

All standard checks passed using Node 24.11.1. The historical PostgreSQL suite was rerun successfully after correcting database setup (20 suites, 152 tests). API unit tests passed 56 suites/330 tests; mobile tests passed 290 tests; parser tests passed 7 tests. The cloud-adapted production image verified all 30 migrations. Android production export passed; full native APK compilation is blocked as described above.

Stopped the local API, software emulator, and test PostgreSQL container. Removed temporary migration-test containers/networks/images. Dependency installations, SDK/JDK tools, build caches, and generated native projects remain available for subsequent work. The routine runner restarts its database automatically. No changes were committed or pushed.

## Reusable setup follow-up

Added the repository-owned workflow in `scripts/cloud/` and `docs/testing/LOCAL_TESTING_CLOUD.md`.
Verified a cold bootstrap in a separate source copy with no dependencies or Node
cache, a repeated bootstrap, and a second cold bootstrap in the working checkout.
The final sequential validation in the separate copy passed release gates, API
lint/build/unit/OpenAPI checks, mobile parser/lint/types/tests, and all PostgreSQL
suites. Its disposable container was removed automatically. Android bundle export
and the repository Dockerfile's optional-CA migration-image test also passed.

A concurrent reinstall invalidated an early trial's checks by removing executables;
added an exclusive state-directory lock and verified that setup is rejected while
validation owns that lock. The corrected final run used fully installed dependencies
and passed. Shell/Node syntax checks, unknown-option rejection, and Git whitespace
checks passed. Optional Android bootstrap was verified against the previously
installed SDK/JDK/AVD. Native APK/device limitations from the original attempt remain.

Future sessions should use the repository scripts, not the original `/workspace`
helpers described earlier in this historical report. Activating automatic setup in
the saved environment still requires setting its setup command and saving/publishing
that configuration in the environment UI.
