# Working in Spendeazy

One product, two independently built npm projects: a native mobile app and a REST API. This file owns repository policy; project `AGENTS.md` files add local guidance. Paths in project documents are relative to that project unless stated otherwise.

## Choose the project

| Task | Guidance / implementation map |
| --- | --- |
| Mobile UI, routing, local PDF parsing/review, Category Rule matching | [Mobile guidance](mobile-app/AGENTS.md), [mobile README](mobile-app/README.md) |
| REST, authentication/authorization, persistence, migrations, duplicates, atomic import commits | [API guidance](api/AGENTS.md), [API task map](api/ARCHITECTURE.md#task-entry-points) |
| HTTP contract or behavior spanning app/server | Read both project guides; inspect the mobile adapter and API endpoint together |
| Domain naming or durable decisions | [GLOSSARY.md](GLOSSARY.md), [domain/ADR ownership](docs/agents/domain.md) |

`web/` source and hosting are retired. The retained `web/design/` files are visual references only and must not regain build, test or deployment jobs without a new decision.

## Cross-project documentation

When a document in one project describes the other, cite that project's stable published surface. Source paths and code samples stay in the owning project; implementation files move. Mobile documents describe API features by the exposed endpoints in the [OpenAPI contract](api/docs/openapi.yaml), the source of truth for shipped API behavior.

## Workflow when implementing code changes

1. Switch to the `main` branch if in a dfferent branch, and get the latest commits `git pull`.
2. Read the owning project's guidance and relevant GitHub issue. Read the glossary before changing domain behavior or names. Use `rg` within the owner.
3. Before editing, create a fresh `dev/<task>-<unique-suffix>` branch. Commit only task changes.
4. Update owning documentation if there are changes in shared terms in the glossary, implementation guidance in project docs, and decisions in the owning ADR directory.
5. Run project-required checks and tests. Commit, `git push -u origin <branch>`, and verify the remote contains the final commit.
6. Open the PR last with `gh pr create`; report its URL. Completion requires passing checks, the pushed final commit, and a PR. Report any blocked step. Retain the branch during review; delete locally/remotely after merging or explicit abandonment. Merge only when authorized.

Run installs/scripts in the owning project (`npm --prefix api ...` or `npm --prefix mobile-app ...`) except the root isolated PostgreSQL suite. Packages, lockfiles, dependencies and environments are project-local.

Native acceptance requires installable Android/iPhone builds, device evidence and the parser launch checks in issue [#138](https://github.com/yororo/spendeazy/issues/138). Lint, type checks and parser fixtures do not certify a native build or device behavior.

## Conditional references

- **Issues/specs:** use `gh` against this repository and [issue-tracker guidance](docs/agents/issue-tracker.md). Verify project-local historical issue references belong to this repository.
- **Triage:** use [triage labels](docs/agents/triage-labels.md).
- **Native verification environment:** start, attach, status, replace, or stop the owned API and database — [local testing](docs/local-testing.md#managed-native-verification-environment). Launch or reload the native build against that API — [launch readiness](docs/local-testing.md#launch-the-native-build-against-that-api).

## Cursor Cloud specific instructions

Node.js 24.11.1 is installed at `/usr/local/lib/nodejs` (the version pinned in `.github/workflows/ci.yml`). `install` and `start` prepend it. If `node -v` is not 24.11.1, export `PATH="/usr/local/lib/nodejs/bin:$PATH"` before API or mobile commands.

`start` launches PostgreSQL 16 and Docker, copies `~/.spendeazy/api.env` to `api/.env`, applies migrations, and runs `npm --prefix api run start:dev`. Health is `http://127.0.0.1:3000/health`. The development database name is `spendeazy_disposable_dev`. Clerk settings in that env file are empty; authenticated calls need a development Clerk instance as described in [API setup](api/README.md).

Run the required API/PostgreSQL suite with `node scripts/local-test-launcher.mjs --api-postgres` from the repository root. That launcher starts a disposable Docker database. Other API and mobile validation commands are in [local testing](docs/local-testing.md). Docker uses `fuse-overlayfs` because this VM has no nested overlay support; `dockerd` and `containerd` are started from `start` because systemd is not the init.

The Android SDK lives at `/opt/android-sdk`. Set `ANDROID_HOME` and `ANDROID_SDK_ROOT` to that path when a shell does not already export them (`/etc/profile.d/android-sdk.sh` does this for login shells). `adb` and `emulator` are on the default PATH. The AVD name is `spendeazy`: Android 16, API 36, Google Play, x86_64, matching Expo SDK 58's compile SDK. `start` boots it headless (`-no-window -no-audio -gpu swiftshader_indirect -no-accel -cores 1`). Software CPU emulation is required here: creating a KVM vCPU faults in `kvm_arch_vcpu_create` on this kernel. Cold boot is about ten minutes; `adb shell getprop sys.boot_completed` prints `1` when the home screen is up. From the emulator, this machine's API is `http://10.0.2.2:3000`. Installing the native app is still `npx expo run:android` from `mobile-app/`, as described in the mobile README. A booted emulator does not by itself satisfy native sign-in acceptance.
