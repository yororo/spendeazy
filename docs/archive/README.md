# Historical evidence

These files preserve dated research, validation, and design provenance. They are not current requirements, architecture, outstanding defect lists, or proof that today's checks pass. Use [agent guidance](../../AGENTS.md) for current task routing and GitHub Issues for requirements/status.

The repository's `.rgignore` excludes this archive from default ripgrep discovery. Read a linked file directly or search it explicitly with `rg --no-ignore <pattern> docs/archive`.

| Evidence | Files | Current source |
| --- | --- | --- |
| PDF parser research (2026-08-22) | [Review](web/research/pdf-parse-v2-review.md) | [Current extractor](../../web/src/features/statement-import/statement-parser/pdf-extractor.ts) and its tests; original target retired and cleanup implemented |
| Historical web validation | [Issue 8](web/validation/issue-8-live-validation.md), [17](web/validation/issue-17-live-validation.md), [18](web/validation/issue-18-live-validation.md), [31](web/validation/issue-31-live-validation.md) | [Current testing guidance](../local-testing.md); rerun affected checks |
| Retired Dashboard theme prototype | [Prototype note](web/dashboard-theme-prototype.md) | [Design system](../../web/DESIGN_SYSTEM.md) and [Theme/Appearance ADR](../../web/docs/adr/0004-independent-theme-and-appearance.md); original executable references remain in Git |
| Mobile spending UX design (2026-09-30) | [Review](ux-review-2026-09-30/report.md), [interview](ux-review-2026-09-30/design-session.md) | [Spec issue #75](https://github.com/yororo/spendeazy/issues/75) and implementation tickets; [local export](../specs/mobile-spending-monitoring.md) supersedes conflicting review proposals |
