# Working in Spendeazy

One product, two independently built npm projects: a native mobile app and a REST API. This file owns repository policy; project `AGENTS.md` files add local guidance. Paths in project documents are relative to that project unless stated otherwise.

## Project status

Project is currently in **ACTIVE DEVELOPMENT** status which means requirements are constantly changing and there are plenty of experimentations. There are no actual users yet - only developers and testers. The priority is to test and iterate quickly; edge cases can be deprioritized. During code changes or design considerations, prefer the simpler approach that does not have major compromises. Overall, basic security discipline should not be compromised. 

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

## Cursor Cloud environment

Node.js 24.11.1 is installed at `/usr/local/lib/nodejs`; prepend its `bin` to `PATH` if the shell selects another version. The Android SDK is at `/opt/android-sdk`; set `ANDROID_HOME` and `ANDROID_SDK_ROOT` accordingly. The `spendeazy` AVD uses a Google Play image. This host requires software emulation (no KVM); boot can take about ten minutes. Confirm `adb shell getprop sys.boot_completed` prints `1`. Use the same local runbook once Docker and the emulator are available; the emulator reaches the host API at `10.0.2.2`.

The image startup script may already be running PostgreSQL and the API against a database other than the runbook Compose database. Point `api/.env` at Compose, stop that API, then follow daily startup. Copy Clerk and Google values from the environment when they are present. The first launch can sit on a blank dev-client screen or an "isn't responding" dialog before the sign-in screen; that screen completes startup until a human finishes Google sign-in.
