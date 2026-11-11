# Working in Spendeazy

One product, two independently built npm projects: a native mobile app and a REST API. This file owns repository policy; project `AGENTS.md` files add local guidance. Paths in project documents are relative to that project unless stated otherwise.

## Project status

Project is currently in **ACTIVE DEVELOPMENT** status which means requirements are constantly changing and there are plenty of experimentations. There are no actual users yet - only developers and testers. The priority is to test and iterate quickly; edge cases can be deprioritized. During code changes or design considerations, prefer the simpler approach that does not have major compromises. Overall, basic security discipline should not be compromised. 

## Cross-project documentation

When a document in one project describes the other, cite that project's stable published surface. Source paths and code samples stay in the owning project; implementation files move. Mobile documents describe API features by the exposed endpoints in the [OpenAPI contract](api/docs/openapi.yaml), the source of truth for shipped API behavior.

## Running in Agent Cloud environments

- For **Codex Linux Cloud** - [Linux cloud validation](docs/agents/linux-cloud-validation.md)
- For **Cursor Cloud** -  [Cursor Cloud environment](docs/agents/cursor-cloud-environment.md)

## Local development and testing

Start with [the local runbook](docs/testing/local-testing.md): first-time setup, daily startup, manual checks, troubleshooting and reset. It uses PostgreSQL in Docker, the API in Nest watch mode and Expo development builds. The same instructions apply to humans and AI agents.
