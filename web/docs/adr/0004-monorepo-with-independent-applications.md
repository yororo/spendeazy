---
status: proposed
---

# Combine Web and API while retaining independent application tooling

Use a new `spendeazy` repository containing snapshots of Spendeazy Web in `web/` and Spendeazy API in `api/`, without importing either Git history. Both applications are still in development; retain the original repositories during migration and keep separate npm installs and lockfiles to avoid coupling this move to dependency or tooling changes.

Root `AGENTS.md`, `docs/ARCHITECTURE.md`, and `CONTEXT.md` own shared instructions, system boundaries, and domain vocabulary. Each application retains its own agent guidance, architecture, coding standards, and context, referencing shared definitions rather than duplicating them.

Preserve existing workflow behavior, changing only source paths and relevant path triggers for the migration. Changes to both applications trigger both existing workflows; documentation-only changes should not trigger application builds or deployments. Do not add validation jobs or other workflow functionality as part of this migration.

Prepare the new repository locally at `C:\Users\seana\source\projects\spendeazy`. GitHub publication and deployment cutover are separate work; retain both source repositories. Do not copy Git metadata, dependencies, build outputs, temporary files, or private environment files into the snapshot.

Use matching application documentation paths: `web/docs/ARCHITECTURE.md` and `api/docs/ARCHITECTURE.md`, with application-local `AGENTS.md`, `CONTEXT.md`, `docs/CODING_STANDARDS.md`, and existing ADRs. Shared vocabulary describes one expense-tracking domain; application contexts supplement that vocabulary. Statement Import names the entire workflow, Committed Statement Import names its persisted result, and Transaction names an expense. This migration does not introduce income or transfers.

The API-generated `api/docs/openapi.yaml` remains the authoritative API contract. Replace the separate Web specification with a reference to it, without introducing a shared package or changing contract generation.

Use the Web repository's `.agents` directory as the monorepo's root `.agents` directory. Track it in the new repository and omit application-local `.agents` directories; the user confirmed the two source directories are the same.

Keep the two existing deployment workflows at root `.github/workflows/`. Each watches relevant files in its application plus its own workflow file, excluding Markdown-only documentation changes. Preserve existing push, pull-request, manual-dispatch, and Web preview-cleanup behavior. Update deployment source paths to the application directories without adding jobs. Correct documentation that incorrectly claims the existing API workflow runs OpenAPI validation.

These design choices were agreed during the migration interview. Implementation awaits final confirmation of the complete scope; GitHub publication and deployment cutover remain outside that scope.
