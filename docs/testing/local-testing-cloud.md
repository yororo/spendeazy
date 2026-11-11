# Reusable cloud setup

This is the Linux x86_64 workflow for a fresh coding session. It recreates the
validated toolchain from repository files instead of depending on a previous
chat's workspace. The manual device workflow remains in [local-testing.md](local-testing.md).

## Saved environment configuration

Set the saved cloud environment's setup command to:

```bash
bash scripts/cloud/bootstrap.sh
```

Run it from the checked-out repository root. If the setup UI starts elsewhere,
first `cd` to that environment's configured repository checkout. Save/publish the
environment configuration using the host UI, and select it for future chats.
The repository changes must be present in those checkouts before enabling this
command. A commit or setup script alone does not update a saved environment image.

Prerequisites: Linux x86_64, Bash, curl, tar with xz, sha256sum, flock, and a running
Docker daemon accessible at `/var/run/docker.sock` for validation. Setup itself
does not require Docker. Download access is needed to `nodejs.org`,
`registry.npmjs.org`, and dependency URLs in the lockfiles. Validation also pulls
`postgres:16-alpine` from Docker Hub. Preserve the host's proxy and CA settings.

Store application credentials in environment settings using the `.env.example`
names. Automated checks use synthetic identities and isolated databases; Clerk
and Google credentials are only needed for manual authenticated smoke tests.
Setup does not copy credentials into files or replace application settings.

## Setup and validation

```bash
# cwd: repository root
bash scripts/cloud/bootstrap.sh
bash scripts/cloud/validate.sh
# Optional production Android bundle and container migration verification:
bash scripts/cloud/validate.sh --bundle --migration-image
```

Setup downloads Node 24.11.1, verifies its archive against the official checksum,
installs both npm projects with `npm ci --include=dev`, and prepares parser assets.
Repeated setup reuses downloaded tools and caches while reinstalling dependencies
from the current lockfiles. Rerun after switching branches or changing dependencies.
Setup and validation take an exclusive state-directory lock and fail clearly if
another operation is running. Do not run installs while checks use the same checkout.

Validation runs release gates, API lint/build/unit/OpenAPI checks, mobile
parser/lint/type/tests, and all required PostgreSQL/HTTP tests. It exits nonzero
on failure. Each run gets a fresh PostgreSQL container, an available loopback port,
and ten separate databases. It ignores supplied test database URLs. On normal
completion it removes its container and database volumes, including after failures.
Run logs and `results.json` are under `.local/cloud/logs/<run>/`. Each check has
a 20-minute timeout so a stalled command is reported as a failure.

For interrupted runs, inspect containers labeled `spendeazy.cloud-validation`
and remove only the abandoned containers belonging to your run. Do not point
tests at deployment or manual databases. Abrupt process termination can prevent
cleanup. Docker failures are reported as failed checks, never skipped passes.

Use `source scripts/cloud/env.sh` in each interactive shell for pinned Node,
Android paths, writable npm/Gradle/Buildx caches, and disabled Expo telemetry.
It does not edit shell profiles. Tools and caches are ignored under `.local/cloud`;
set `SPENDEAZY_CLOUD_STATE` to an absolute writable directory to relocate them.
Distinct checkouts should use distinct state directories.

The Dockerfile optionally accepts a `proxy_ca` BuildKit secret. The migration-image
test automatically supplies `CODEX_PROXY_CERT` when configured. TLS verification
stays enabled and the CA is not copied into image layers. Without that variable,
normal CI builds use the image's standard certificate roots.

## Optional Android native toolchain

The default setup deliberately avoids large Android downloads and emulator boot.
For native compilation, provide Java 21 and unzip, then run:

```bash
bash scripts/cloud/bootstrap-android.sh --accept-licenses
# Add --avd to also install the Android 15 Google Play image and create spendeazy.
source scripts/cloud/env.sh
cd mobile-app
npx expo prebuild --platform android --no-install
# Restore package.json android/ios script rewrites from Expo if present.
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=2
```

`--accept-licenses` explicitly accepts the Android SDK licenses. This optional setup
installs SDK Platform 37.0, Build Tools 37.0.0, NDK 27.1.12297006, emulator, platform
tools, and Oracle JDK 17.0.12 (verified checksum) for React Native's Gradle plugin.
JDK 17.0.12 reproduces the tested setup; maintain its pin as toolchain requirements
and vendor security updates change. This JDK is a build tool, not the app runtime.
Keep the host's Java 21 for Gradle. SDK downloads use `dl.google.com`; Gradle also
needs Maven Central, Google Maven, Gradle distribution/plugin hosts, and any
redirect destinations. Explicit network-policy denials require settings changes.

AVD creation does not establish successful boot or sign-in. Hardware acceleration
requires virtualization support and `/dev/kvm` supplied by the host; packages inside
the container cannot provide it. Native tools may require sandbox access to their
standard home-directory state. The tested host lacked KVM, and full native
compilation hit a Google Maven HTTP 503. See [the validation report](local-testing-cloud-validation-2026-11-11.md).

For a headless software-emulation attempt after `--avd` setup:

```bash
emulator -avd spendeazy -no-window -no-audio -no-snapshot -gpu swiftshader -accel off -memory 2048
```

Only treat the device as booted when ADB lists it as `device` and
`adb shell getprop sys.boot_completed` returns `1`. Device screenshots, Google
sign-in, native interactions, performance, and iOS builds need separate evidence.
