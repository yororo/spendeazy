## Problem Statement

Spendeazy Web and Spendeazy API currently live in separate repositories even though they serve the same product. Contributors and agents must coordinate separate instructions, architectural guidance, and overlapping domain definitions. Consolidating them must preserve each application's tooling and deployment behavior without causing unrelated application deployments.

## Solution

Prepare a fresh local Spendeazy monorepo with root `web` and `api` application folders. Retain separate application instructions, architecture, coding standards, and context while introducing shared system guidance and vocabulary. Keep independent dependency installations and adapt the two existing deployment workflows to the new layout and relevant changes only.

This specification covers local migration preparation. Publishing the new repository and switching deployed services are separate work.

## User Stories

1. As a maintainer, I want both applications in one repository, so that related product changes can be reviewed together.
2. As a developer, I want clearly named Web and API application folders, so that I can find the code I need.
3. As a maintainer, I want a fresh repository snapshot without imported commit histories, so that this development-stage migration stays simple.
4. As a maintainer, I want both original repositories preserved, so that I can reference them during migration.
5. As a Web developer, I want Web dependencies and scripts to remain independent, so that API tooling does not affect my workflow.
6. As an API developer, I want API dependencies and scripts to remain independent, so that Web tooling does not affect my workflow.
7. As a contributor, I want shared agent instructions, so that repository-wide work follows consistent rules.
8. As an agent, I want application-specific instructions, so that changes respect each application's boundaries.
9. As a contributor, I want a system architecture overview, so that I understand how Web, API, authentication, and persistence relate.
10. As a developer, I want separate application architecture documents, so that implementation details remain owned by the relevant application.
11. As a developer, I want each application's coding standards retained, so that the migration does not change established conventions.
12. As a contributor, I want shared domain definitions with application-specific supplements, so that overlapping terminology does not contradict itself.
13. As a contributor, I want Statement Import distinguished from its committed record, so that temporary review state and persisted provenance are unambiguous.
14. As a contributor, I want Transaction terminology to reflect expenses, so that documentation matches the current product scope.
15. As an agent, I want one shared collection of project skills, so that duplicate skill directories do not drift.
16. As a Web developer, I want one authoritative API contract, so that I do not rely on a competing specification.
17. As a maintainer, I want Web-only implementation changes to trigger only the Web workflow, so that API deployments remain unrelated to Web edits.
18. As a maintainer, I want API-only implementation changes to trigger only the API workflow, so that Web deployments remain unrelated to API edits.
19. As a maintainer, I want changes affecting both applications to select both workflows on their existing supported events, so that both applications receive their existing deployment behavior.
20. As a maintainer, I want documentation-only edits excluded from application deployments, so that guidance changes do not rebuild services.
21. As a maintainer, I want each workflow to respond to changes to its own definition, so that deployment configuration changes remain actionable.
22. As a reviewer, I want existing Web preview cleanup preserved, so that relevant closed pull requests do not leave abandoned previews.
23. As an operator, I want existing API manual deployment preserved, so that the migration does not remove an operational capability.
24. As a developer, I want application builds, tests, and local startup to work after relocation, so that the new layout is usable.
25. As a maintainer, I want credentials and generated local artifacts excluded from the snapshot, so that the new repository contains appropriate project sources.
26. As a maintainer, I want publication and deployment cutover documented separately, so that local preparation does not unexpectedly change running services.

## Implementation Decisions

- Create a new local repository named Spendeazy beside the existing source repositories. Use fresh source snapshots; do not import Git history or modify or remove the original repositories during migration.
- Use the agreed root application folder names, Web and API in lowercase. Preserve independent npm manifests, lockfiles, installation scopes, and application commands. Do not introduce npm workspaces or dependency hoisting.
- Preserve the current application architectures: Web feature slices and API feature modules with application-owned persistence interfaces. The shared overview explains their integration rather than replacing their internal architectures.
- Provide shared root agent guidance, architecture, and domain context. Retain application-local agent guidance, context, coding standards, and ADRs. Standardize application architecture documentation under each application's documentation area.
- Shared context owns common expense-tracking definitions. Application contexts reference these definitions and add their own terms without duplicating or contradicting the shared language.
- Statement Import denotes the whole workflow. Committed Statement Import denotes its persisted provenance record after reviewed transactions are confirmed and saved together. Transaction denotes an expense recorded manually or confirmed through Statement Import.
- Use the Web project's agent-skill directory as the single shared root collection. Include it in the new repository despite its ignored status in the source Web repository. Do not retain nested skill collections in either application.
- Retain the API-generated OpenAPI YAML as the authoritative API contract. Replace Web's separate specification with a reference to it. Preserve existing generation behavior; introduce no shared contract package.
- Move both existing GitHub Actions definitions into the monorepo's root workflow area. Change only migration-required application source/build-context paths and relevant path filters. Preserve job behavior, deployment destinations, event types, branch selection, Web pull-request preview cleanup, and API manual dispatch.
- Each workflow selects relevant changes in its own application and changes to its own definition. Changes to both applications select both workflows only for events each already supports; do not add API pull-request triggers. Shared build configuration, if present, selects affected workflows. Documentation-only changes, including Markdown within application folders, do not trigger application builds or deployments.
- Preserve Web deployment through Azure Static Web Apps and API deployment through Azure Container Apps with the API application as its Docker build context. Do not change runtime behavior or infrastructure.
- Update documentation references and local development instructions to the new layout. Correct the API documentation's unsupported claim that its existing workflow runs OpenAPI validation; do not add a job to make that claim true.
- Exclude nested Git metadata, installed dependencies, build outputs, temporary artifacts, and private environment files. Preserve non-secret environment examples and application configuration needed for independent setup.
- Keep issue-tracker guidance aligned with the actual repository state; GitHub publication and future tracker relocation are not performed by this migration.

## Testing Decisions

The following validation seams were confirmed by the user:

- Prefer the existing application command boundaries and workflow configuration boundaries. No new runtime test hooks, test framework, or CI jobs are needed.
- Validate externally meaningful outcomes: each relocated application installs independently, builds, and passes its existing relevant checks. Avoid tests that merely assert copied implementation details or freeze incidental directory contents.
- Use Web's existing lint, production build, and Vitest suite. Use API's existing lint, production build, Jest unit and end-to-end suites, and deterministic OpenAPI check. Run these locally; document any unavailable database or credential prerequisites rather than adding CI functionality or claiming unperformed checks passed.
- Check local startup using each application's documented working directory and non-secret setup. Validate the existing API Docker build context after relocation where the required tooling is available. No live deployment is required for acceptance.
- Review and validate workflow path selection with a small change matrix: Web implementation only; API implementation only; both; each workflow definition independently; shared or application Markdown documentation only; relevant shared build configuration if any. Expected selections must respect each workflow's existing event types.
- Confirm that relevant Web pull-request close events retain the cleanup job and that API manual dispatch remains available. Local configuration validation does not constitute proof of a hosted deployment; report that limit explicitly.
- Inspect the resulting repository for one root skill collection, preserved application lockfiles and ADRs, working documentation links, authoritative contract references, and absence of nested repositories or private local artifacts.
- Existing Vitest, Jest, end-to-end tests, and the OpenAPI consistency command are the prior art. Reuse those seams rather than introducing migration-specific product tests.

## Out of Scope

- Importing either repository's Git history.
- Publishing or pushing the new repository to GitHub, transferring issues, or archiving the source repositories.
- Deployment cutover, repository secret or variable migration, Azure federated identity changes, or branch-protection configuration.
- New workflow jobs, validation pipelines, event triggers, deployment capabilities, or generalized change-detection infrastructure.
- A workspace package manager, shared lockfile, shared code package, dependency upgrades, or application architecture refactors.
- New product behavior, income or transfer support, database schema changes, API contract redesign, and UI changes.

## Further Notes

- The intended local destination is `C:\Users\seana\source\projects\spendeazy`, with `web` and `api` as its root application directories.
- Both source repositories were inspected on clean main branches before this session's documentation edits. Include the agreed documentation changes when preparing the eventual source snapshot.
- Existing workflows are deployment workflows, not comprehensive validation pipelines. This specification intentionally preserves that scope.
- The future GitHub cutover will require repository variables and secrets and review of Azure's repository-bound federated identity. Existing workflow configuration can be prepared locally without performing that cutover.
- The migration ADR remains proposed until the overall scope receives final confirmation. This specification request authorizes documentation and issue publication through the invoked skill; it does not initiate the local migration.
