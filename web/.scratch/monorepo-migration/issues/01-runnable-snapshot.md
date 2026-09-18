## Parent

https://github.com/yororo/spendeazy-web/issues/48

## What to build

Prepare a fresh local Spendeazy repository beside the two original repositories, containing runnable Web and API applications in the agreed root application folders. Preserve independent developer workflows and consolidate project skills from Web at the monorepo root. This is local preparation only.

## Acceptance criteria

- [ ] Create the agreed new local repository with fresh application snapshots and no imported Git history; preserve both original repositories and include the design documentation agreed in the specification.
- [ ] Preserve independent npm manifests, lockfiles, scripts, and installation scopes without introducing workspaces, shared dependencies, or upgrades.
- [ ] Copy the Web project skill collection to the shared root and ensure it is tracked even though ignored in the source Web repository. Neither application contains a nested skill directory.
- [ ] Exclude nested Git metadata, private environment files, installed dependencies, build outputs, and temporary artifacts. Preserve non-secret environment examples and required project configuration.
- [ ] Each application installs and builds independently from its own working directory. Run existing Web lint and Vitest checks, and API lint, Jest unit/end-to-end checks, and deterministic OpenAPI validation. Document any unavailable prerequisites and distinguish them from passed checks.
- [ ] Verify local startup with documented non-secret setup and the relocated API Docker build context where tooling is available. Do not change application behavior to accommodate unavailable credentials or infrastructure.
- [ ] Record validation outcomes and ensure migration tooling has not modified the source repositories.
- [ ] Do not publish, push, deploy, transfer issues, or archive repositories. Leave shared-documentation reconciliation and deployment-workflow adaptation to the dependent tickets.

## Blocked by

None — can start immediately.
