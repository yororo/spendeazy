## Parent

https://github.com/yororo/spendeazy-web/issues/48

## What to build

Make the local monorepo understandable to contributors and agents through shared system guidance, precise domain language, and complete application-specific documentation. Provide one authoritative API contract reference while retaining independent application architecture and coding standards.

## Acceptance criteria

- [ ] Provide shared root agent guidance, system architecture, and domain context that explain application ownership and integration boundaries without replacing either application's internal architecture.
- [ ] Retain each application's agent guidance, context, coding standards, and existing ADRs; standardize architecture documentation within the respective application documentation areas.
- [ ] Define shared terms once and reference them from application supplements. Statement Import means the entire workflow; Committed Statement Import means its persisted provenance record; Transaction means an expense recorded manually or confirmed through Statement Import.
- [ ] Preserve Web feature-slice boundaries and API feature-module and persistence-interface boundaries. Do not introduce product behavior, schema changes, or income/transfer support.
- [ ] Reference the API-generated OpenAPI YAML as authoritative and replace the separate Web specification with a reference, without modifying generation behavior or adding shared packages.
- [ ] Update setup and navigation guidance for independent application working directories, the shared root skill collection, and the new layout. Keep issue-tracker guidance accurate for the existing tracker rather than assuming a future GitHub repository exists.
- [ ] Correct documentation that claims the existing API workflow runs OpenAPI validation; do not add workflow functionality.
- [ ] Verify documentation links, canonical-term consistency, preserved application standards and ADRs, and the reproducibility of documented setup commands using results from the snapshot ticket where still applicable.
- [ ] Document GitHub publication, secrets/variables, Azure identity changes, and deployment cutover as separate future work. Do not execute them.

## Blocked by

- https://github.com/yororo/spendeazy-web/issues/49 — Create a runnable local monorepo snapshot.
