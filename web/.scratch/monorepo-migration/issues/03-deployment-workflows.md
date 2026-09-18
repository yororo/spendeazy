## Parent

https://github.com/yororo/spendeazy-web/issues/48

## What to build

Adapt the two existing deployment workflows so the local monorepo configuration selects only the relevant application and uses the correct application source and build context. Preserve existing deployment capabilities without adding jobs or event types.

## Acceptance criteria

- [ ] Place both existing workflow definitions in the monorepo's root workflow area, eliminating application-local duplicate workflow definitions.
- [ ] Point Web deployment at the Web application and API deployment at the API application with its existing Docker build context. Preserve deployment destinations and job behavior.
- [ ] Preserve existing branch and event selection, including Web pull-request previews and close-event cleanup, and API manual dispatch. Do not introduce API pull-request triggers.
- [ ] Each workflow selects relevant changes in its application and its own definition. Documentation-only changes, including application Markdown, select neither application workflow. Relevant shared build configuration, if present, selects affected workflows.
- [ ] Validate the change matrix for Web-only implementation, API-only implementation, both applications, each workflow definition independently, shared/application documentation only, and relevant shared build configuration if present. Expected results respect each workflow's existing supported events.
- [ ] Confirm relevant Web pull-request close events retain cleanup behavior and API manual dispatch remains available independently of push path filters.
- [ ] Validate workflow syntax, application-source paths, and API Docker context with available local tooling. Report local validation separately from hosted deployment evidence; do not claim unexecuted deployments passed.
- [ ] Limit edits to migration-required paths and triggers. Add no validation jobs, test infrastructure, generalized change-detection system, deployment capabilities, or dependency upgrades.
- [ ] Do not publish the repository, push workflow changes, migrate secrets/variables, modify Azure identity or branch protection, or trigger deployments.

## Blocked by

- https://github.com/yororo/spendeazy-web/issues/49 — Create a runnable local monorepo snapshot.
