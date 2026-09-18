# Domain documentation

Spendeazy has one domain shared by the web and API projects. Their deployment and implementation boundaries do not create separate domain contexts.

- Read [root CONTEXT.md](../../CONTEXT.md) before naming or changing domain behavior. It is the sole glossary; add resolved terms there, without implementation details.
- Read relevant decisions in [web/docs/adr/](../../web/docs/adr/) and [api/docs/adr/](../../api/docs/adr/). ADR numbers are project-local: identify a decision by project and filename, not number alone.
- Keep project-specific decisions in those existing directories. Use root `docs/adr/` only when a new decision genuinely spans both projects; create it when needed.
- Architecture and API transport mappings belong in project architecture documents or the [root integration overview](../../README.md), not in duplicate glossaries.
- Surface a conflict with an accepted ADR explicitly before reversing it. Superseded ADRs preserve rationale; they do not describe current behavior.

Research, validation reports, and specification notes describe their recorded scope and date. Confirm current implementation and the relevant GitHub issue before using them as requirements.
