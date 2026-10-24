# Domain documentation

Spendeazy's domain is shared by the native mobile client and API. The root [GLOSSARY.md](../../GLOSSARY.md) is the sole glossary; add resolved terms there without implementation details. Mobile documentation links to it rather than maintaining another definition set.

Read relevant decisions in root `docs/adr/` and `api/docs/adr/`. There is no active browser project or web ADR directory. ADR numbers are directory-local: identify a decision by project and filename, not number alone. Keep project-specific decisions in their project directories; use root `docs/adr/` for cross-project decisions.

Architecture and HTTP transport mappings belong in project architecture documents or the [root integration overview](../../README.md#responsibilities), not in duplicate glossaries. Superseded ADRs preserve rationale but do not describe current behavior.

Research, validation reports and specification notes describe their recorded scope and date. Confirm current implementation and the relevant GitHub issue before using them as requirements.

## Cross-project decisions

| Change | Decision to read | Status |
| --- | --- | --- |
| Synthetic identity and isolated test environment | [Isolated API test identity](../adr/0001-isolated-local-synthetic-identity.md) | Current for automated tests only |
| Space ownership, membership or archival | [Personal and Shared Spaces](../adr/0002-personal-and-shared-spaces.md) | Ownership/lifecycle current; invitation details superseded by Invite Codes |
| Invitation lifecycle or joining | [Invite Codes](../adr/0003-invite-codes-for-shared-space-invitations.md) | Current |
| Native client ownership and browser retirement | [Retire the browser client](../adr/0005-retire-browser-client.md) | Current |
| Expense/Transaction vocabulary and target API | [Mobile Expense contract](../adr/0004-mobile-expense-domain-and-contract.md) | Accepted target; implementation pending |
