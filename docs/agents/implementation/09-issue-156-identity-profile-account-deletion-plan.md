# Implementation Plan: Identity Profile and Complete Account Deletion

## 1. Overview

- **Objective:** Implement [issue #156](https://github.com/yororo/spendeazy/issues/156): Clerk-owned name/photo editing and durable account deletion across PostgreSQL, Clerk and the native app.
- **Scope:** Profile editor, Account settings, provider synchronization, current actor presentation, deletion acceptance/status, background reconciliation, provisioning/access fences, Personal-data removal, retained Shared attribution and private-device cleanup.
- **Constraints:** Plan only. Preserve Appearance, Sharing, immutable financial evidence/results and existing archives. No email editing, financial-history email, email-based identity relinking, server photo upload endpoint, new offline queue or web client. Use feature-owned application ports and TypeORM adapters. Do not delete any real identity or reset any database during planning.

Authority: [parent #140](https://github.com/yororo/spendeazy/issues/140), issue #156 and its [accepted identity/profile/deletion contract](https://github.com/yororo/spendeazy/blob/0a5983408507bdecb771ac16c5a440f82a5595e7/docs/specifications/mobile-expense-domain-api.md#identity-profile-and-deletion). The pinned specification path no longer exists in this checkout; use that published revision. Current shipped behavior is in `api/docs/openapi.yaml`. All repository paths below are root-relative; **new** locations are proposals, not existing files.

## 2. Current State

- `api/src/users/application/users.service.ts` reads Clerk, derives name/verified email, provisions a User and separately ensures Personal Space/default Categories. Updates are not serialized with deletion. `TypeOrmUserStore.findByClerkUserId` excludes `deletedAt`; replacing the provider ID during current deletion loses the old-identity fence.
- `api/src/authentication/clerk-profile-service.ts` only reads profiles. `UserEntity` has no photo/deletion-progress fields. `ProvisionedUserGuard` exempts provisioning and otherwise resolves an undeleted local User. Token verification checks JWTs locally, so provider revocation alone cannot fence already-issued tokens immediately.
- `DELETE /api/v1/users/me` currently returns 204 after `SpaceLifecycleService.deleteIdentity`. `typeorm-space-lifecycle-store.ts` locks Users then Spaces, archives active Shared Spaces and replaces identity values with synthetic ones. It removes Personal membership but retains Personal data and Shared memberships. There is no durable provider/session cleanup.
- `space-write-guard.ts` and reviewed-import execution lock the actor before Space mutations, but check actor existence rather than deletion state. Some configuration writes have no actor lock. Invitation acceptance locks both Users. These are reusable coordination seams, not complete deletion fencing.
- Migration `1990000000000-add-import-confirmation-evidence.ts` protects immutable imports/results; its DELETE paths allow physical evidence removal. Foreign keys require ordered Personal cleanup. Archived-Space write triggers must remain effective for Shared history.
- `mobile-app/src/app/(app)/(tabs)/profile.tsx` displays Clerk identity, Appearance, Shared Space and sign-out, without editor/settings actions. `user-api-client.ts` only provisions and discards the response. `SpacesProvider` provisions on load. Member records contain `{id,name}`; Expense Added By/Activity and import views resolve actor IDs through current members.
- `session.acceptedAccountDeletion()` already clears private identity, increments generation and invokes serialized receipt cleanup. `confirmation-receipt.ts` fences late storage operations. Root navigation gates cleanup failures, but ordinary auth loss retains same-owner drafts for recovery; deletion needs a distinct terminal identity path. Clearing session identity while Clerk remains signed in can otherwise let `observeIdentity` restore it.

## 3. Proposed Solution

### Identity and presentation

Use a native feature-owned editor with First name, optional Last name and Choose photo. These compose Clerk's display name without guessing how to split a stored full name. Keep email read-only on Profile. Wrap Clerk `user.update()` and `user.setProfileImage()` in a mobile identity adapter; use SDK 58 `expo-image-picker` for one library image. No camera flow or custom image cropper is required. Add the compatible package/config through Expo, rebuild native clients, and discard app-owned image copies after upload/cancellation/cleanup.

Save changed provider fields, then invoke authenticated `PUT /users/me` without identity input. Name and image updates are separate provider operations: track successful steps, synchronize any partial success, preserve failed edits and retry only unfinished work. Provider success followed by API failure displays “Your profile changed, but Spendeazy could not refresh it. Retry synchronization.” Retry fetches provider truth rather than resending successful mutations. Apply the existing 200-character composed-name limit before saving; retain the server's existing fallback for missing provider names. Enable name editing in the development Clerk instance and verify the installed SDK's native image input format before implementation.

Extend GET/PUT User responses with `photoUrl: string|null` and proposed `deletionStatus: 'active'|'pending'|'completed'`. Pending/completed identities cannot read the profile; these states are represented by the restricted deletion endpoint. Add nullable photo to the provider projection, User persistence and member presentation. Financial responses continue exposing stable actor IDs; current labels/photos resolve through the Space's current identity projection. Keep a sanitized `{id,name:'Deleted user',photoUrl:null}` attribution entry for former contributors while removing their membership/access. Build that projection from retained Shared actor references as well as current members; do not confuse attribution with authorized membership. No provider IDs or emails enter it, and do not change immutable confirmation results to add profile snapshots.

### Durable deletion protocol

Use one PostgreSQL `account_deletion_operations` row per old Clerk identity, with a unique old-provider-ID fence retained after completion. Store User ID, initiating Clerk session ID, pending/completed status, acceptance time, stage checkpoints, retry time/count, claim token/expiry and safe failure code. Do not store bearer tokens, profile snapshots, financial payloads or raw provider errors. Keep the old provider ID only in this restricted operation record; the retained User becomes a non-authenticating tombstone. Use nullable email rather than a fabricated address, release its unique-email reservation on acceptance, and erase name/photo immediately.

Acceptance is one database transaction: discover affected members, lock User rows in numeric ID order, revalidate membership, then lock affected Spaces in numeric order. If discovery changed while waiting, roll back and rediscover; never acquire a newly discovered lower-order User lock while already holding higher ones. Create/reuse the operation, mark User pending, scrub profile, archive active Shared Space, clear active pointers, remove all deleting-User memberships including old archives, revoke pending sent invitations and remove claims both by that User and against revoked invitations. Create the surviving member's idempotent archive notification in the same transaction. Sanitize older notification messages containing the deleted actor's former name, and remove notifications addressed to the deleted User. Preserve every other member's existing archive access.

Lock order for financial work remains User → Space → import operation. Every write, including configuration, invitation creation/claim/acceptance and provisioning/default creation, must recheck active identity **inside** its transaction after acquiring the appropriate User lock. Provisioning checks the retained provider fence before a provider call and again before creating/updating/default provisioning; serialize by old provider ID with a transaction-scoped advisory lock, used by acceptance too. This covers the absent-row/concurrent-create case. Never create a replacement local User for a fenced identity. Fresh provider IDs may create fresh Users, including with the same email.

Reject all normal authenticated routes for pending/completed identities with proposed 403 `ACCOUNT_DELETION_PENDING` / `ACCOUNT_DELETED`; mobile treats both as private-state cleanup signals. Public health/docs remain public. Only the deletion protocol is available: initiating-session status and idempotent DELETE retries. Verify the initiating session is still valid with Clerk for those restricted routes; local JWT validity alone does not establish non-revocation. Provider verification outage returns a retryable availability error, never completion. Other sessions receive a cleanup signal, not deletion status. No operation IDs or unauthenticated status URL grant access.

| Request | Proposed result |
| --- | --- |
| First confirmed `DELETE /api/v1/users/me` | Commit acceptance, return **202**, `Location: /api/v1/users/me/deletion`, body `{status:'pending'}`. Do not wait for Clerk. |
| Same initiating session repeats DELETE | Same pending result, or **204** only if every stage is durably complete and the credential is still valid. No new operation. |
| `GET /api/v1/users/me/deletion` | **200**, exactly `{status:'pending'|'completed'}`, `Cache-Control: no-store`. Active identity without an operation gets 404; revoked/expired session gets 401. |
| Normal profile/provisioning/financial access after acceptance | Stable deletion error; no profile or financial response. |

A Nest-managed polling reconciler starts with the API and scans due rows after restart. Use short `FOR UPDATE SKIP LOCKED` claims, an expiring claim token, bounded batch/concurrency and retry backoff with jitter (5 seconds initially, capped at 15 minutes; honor provider Retry-After). Do not hold database transactions across provider calls. Checkpoints update conditionally on the current claim token; expired claims allow safe idempotent replay after crashes. There is no maximum attempt count that abandons accepted deletion. Stop polling cleanly on shutdown. This requires an always-running API process; document that deployment assumption. Webhooks are unnecessary for this issue.

Reconcile independent checkpoints so provider outage does not block Personal cleanup:

1. Permanently remove Personal data in one transaction under User → Personal Space locks. Delete Activity → Expenses → import operations → imports (cascading source rows) → Rules/Budgets → Categories → residual memberships/notifications → Personal Space. Include soft-deleted Expenses, evidence JSON, operation hashes/results and all existing Personal Spaces owned by the User. Keep the User tombstone and deletion operation. Never delete retained Shared operations/evidence by actor ID. Keep Personal Space active until this purge so its existing write triggers allow ordered DELETEs; membership removal and pending identity already fence external access.
2. Through a server identity adapter, enumerate all provider sessions with pagination and revoke them idempotently, then delete the Clerk User. Track revocation and provider deletion separately. Distinguish already-revoked/already-absent from authentication/configuration errors, throttling and outages. A lost provider response must be reconciled by rereading provider state. Confirm with real identities that deletion terminates sessions created during the revoke/delete interval; otherwise repeat reconciliation until absence/revocation is established. Absence after a prior lost delete must allow progress without requiring an impossible profile read.
3. Finalize User deleted state and operation completed only when Personal purge, provider removal and session revocation are established. Retain the minimal old-ID fence indefinitely for this release; it cannot authenticate, relink email or restore memberships.

Do not weaken Shared immutability/archive triggers or install a general-purpose trigger bypass. New reads must check active identity as part of authorization/query execution, not reuse an earlier successful guard decision. For a multi-query financial read, protect the active actor with a shared User lock in the same read transaction; acceptance waits for preceding reads/writes. Already-delivered network data cannot be recalled; mobile generation checks must discard late responses.

```mermaid
sequenceDiagram
    participant App
    participant API
    participant DB as PostgreSQL
    participant Worker as Reconciler
    participant Clerk
    App->>API: DELETE /users/me (explicit confirmation)
    API->>DB: Atomic pending fence, archive, revoke access, operation
    DB-->>API: Commit acceptance
    API-->>App: 202 + Location + pending
    App->>App: acceptedAccountDeletion(); gate private cleanup
    loop Until all checkpoints complete, including after restart
        Worker->>DB: Claim due operation
        Worker->>DB: Purge Personal data idempotently
        Worker->>Clerk: Reconcile sessions and identity removal
        Worker->>DB: Persist progress / retry / completed
    end
    Note over App,Clerk: Sign-out can precede completion; app cooperation is unnecessary
```

### Mobile deletion states and design adaptations

Keep deletion workflow ownership above `SpacesProvider` and protected app routes. Maintain an account-level credential scope independent of Space selection. Once acceptance is known, block normal identity observation/provisioning for that provider ID, invoke `session.acceptedAccountDeletion()`, and show only cleanup/deletion status or sign-out. Deletion status requests must use a narrowly scoped transport that survives financial-session clearing; do not broadly bypass session guards. It checks the initiating Clerk identity/session before and after each request. It must never retain tokens on disk.

| State | Behavior and copy |
| --- | --- |
| Confirmation | Explain permanent Personal-data removal, Clerk identity/all-session removal, active Shared archival and the other member's retained history under Deleted user. “Cancel” is initially focused; “Request account deletion” is explicit. Cancel sends no request. |
| Submitting | One request; disable repeated submission. Closing cannot undo a request already sent. |
| Uncertain response | “We could not confirm whether your deletion request was accepted.” Gate financial UI; offer Check status and retry the same idempotent DELETE. 404 is not success; a status check can precede delayed acceptance. Never claim cancellation/failure from a timeout, 401 or import-status denial. |
| Accepted/pending | “Your deletion request was accepted. Cleanup continues even if you close the app or sign out.” Clear private state; offer status refresh while authorized and Sign out. No cancel action. |
| Completed | Show only after authenticated `{status:'completed'}` or DELETE 204. “Account deletion completed.” Proceed to sign-in after cleanup/sign-out. |
| Signed out / revoked before proof | Explain that access ended and completion could not be checked. If acceptance was observed, say cleanup continues; if the submission was uncertain, retain that uncertainty. Never label sign-out completed deletion. |

Persist only a minimal device deletion intent marker (provider/session binding and submitted/accepted phase, no profile/financial data) before submission, separate from import receipts. It gates restart into status reconciliation rather than provisioning after response loss. Clear or reduce it to non-identifying messaging on explicit sign-out/completion; never attach it to another identity. If its write fails, do not submit. Cleanup failure keeps the existing retry gate; it does not roll back server acceptance.

Map Profile to `ZZMFP`, identity to `LNW8t`, Edit profile to `XS1TB`, Account settings to `pXNTs`, Shared card to `eY68d`, sign-out to `Jbjz1`. New editor/settings/status screens use existing Screen, TextField, buttons, ChoiceSheet and CenteredDialog recipes. Adapt `Ataa3` to account consequences and `VgDBB` to provider/sync/deletion retry states; remove Expense-specific labels. Increase the source's 44-unit settings target to at least 48. Preserve Outfit, semantic colors/dark adaptation, scaling, safe-area/keyboard scrolling, 48-unit controls, 52-unit primary actions, focus/announcements and reduced motion. Record adaptations in `mobile-app/design/design-token.md`; there are no dedicated source boards for these new screens.

### Research basis (checked 2026-10-30)

- [Clerk Expo User reference](https://clerk.com/docs/expo/reference/objects/user): profile mutation methods and required instance settings; keep the provider as authority.
- [Clerk user management](https://clerk.com/docs/guides/users/managing), [session listing](https://clerk.com/docs/reference/backend/sessions/get-session-list) and [revocation](https://clerk.com/docs/reference/backend/sessions/revoke-session): use server capabilities, paginate sessions and test provider outcomes.
- [Expo SDK 58 ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/): use the system image library, compatible installation/configuration and cancellation handling. Verify native upload representation against installed Clerk types; do not assume a browser File object.
- [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html): consistent lock order and transaction boundaries support acceptance fencing. Durable stage/claim behavior above is a proposed application design, not an existing feature.

## 4. Implementation Tasks

### Task 1: Add deletion persistence and photo projection

- **Goal:** Store durable progress and preserve old-identity fencing without profile retention.
- **Location:** `api/src/database/entities/user.entity.ts`, `database-options.ts`; **new** migration after `1990000000000` and `account-deletion-operation.entity.ts`; `api/src/users/application/user-store.ts`, `infrastructure/typeorm-user-store.ts`.
- **Changes:** Add nullable photo, explicit User lifecycle state and nullable email with uniqueness for live values. Add operation fields, unique old Clerk ID/User operation identity, due-row index and stage/checkpoint constraints from section 3. Keep `deletedAt` semantics explicit: pending starts at acceptance; completed deletion sets final deletion time. Make active lookups exclude pending/deleted; add a restricted operation lookup independent of active User resolution. Register entity/migration. Keep old migrations intact.
- **Verification:** Migration on a disposable database; uniqueness, nullable email reuse, pending/completed lookup behavior, operation retention and no email/photo snapshots. Update existing User fixtures.

### Task 2: Implement atomic acceptance and identity fences

- **Goal:** Accepted deletion immediately removes authority and cannot be undone by concurrent provisioning.
- **Location:** `api/src/users/` (**new** deletion service/store/unit-of-work ports and adapters); `api/src/spaces/infrastructure/typeorm-space-lifecycle-store.ts`, `application/space-lifecycle.service.ts`; `api/src/authentication/provisioned-user.guard.ts`; `api/src/users/application/users.service.ts`; `api/src/invitations/infrastructure/`; `api/src/spaces/infrastructure/space-write-guard.ts`; `api/src/statement-imports/infrastructure/typeorm-reviewed-import-unit-of-work.ts`; configuration stores under `api/src/categories/infrastructure/`.
- **Changes:** Implement section 3 acceptance transaction; reuse/refactor lifecycle logic into transaction-bound helpers instead of nesting separately committing workflows. Replace the local-only deletion path. Move notification persistence into acceptance, sanitize historical actor messages, remove all deleted-User memberships and preserve surviving access. Apply old-provider advisory locking to acceptance/provisioning, transactional state checks to profile/default provisioning, writes and invitation paths. Add deletion-specific errors and read-time active identity checks with shared actor locking for multi-query financial reads. Do not rely on only HTTP guards or membership checks made before lock acquisition.
- **Verification:** Core unit tests plus PostgreSQL barriers around stale provisioning, delayed financial writes, Category configuration, invitations, archive and import confirmation. Assert one full preceding financial commit or no write, no recreated Personal Space/defaults, immediate access rejection and retained Shared result bytes. Exercise simultaneous member deletions/leave and lock rediscovery without deadlocks.
- **Dependencies:** Task 1.

### Task 3: Add provider cleanup adapter and durable reconciler

- **Goal:** Finish deletion with the app absent through outages and crashes.
- **Location:** `api/src/authentication/clerk-profile-service.ts`, `authentication.module.ts`; **new** server identity deletion adapter/port; deletion feature from Task 2; `api/src/users/users.module.ts`, `api/src/api-feature-modules.ts`, `api/src/config/`; `api/src/database/` purge adapter.
- **Changes:** Implement paginated session revocation, identity deletion/absence reconciliation and safe error classification behind injected ports. Add independently retryable Personal purge and provider checkpoints, conditional claim-token updates, startup polling, retry/backoff and shutdown handling. Complete only when all checkpoints hold. Keep provider calls outside database locks. Use existing logging allowlist with operation/stage/safe codes, excluding identity payloads; add minimal retry settings only if operationally needed and document defaults. No Redis or new job service is needed.
- **Verification:** Adapter fakes cover read/delete response loss, 404, already revoked, rate limit, timeout and 5xx without conflating credentials errors with absence. Crash tests at claim, external success-before-checkpoint and purge-before-checkpoint; two workers/expired claims converge once. Fixture every Personal table and assert physical removal while Shared snapshots/results survive byte-for-byte. Dedicated real Clerk identities verify update/read/delete and all-session revocation, including multiple sessions and concurrent session creation.
- **Dependencies:** Tasks 1–2.

### Task 4: Publish profile and deletion HTTP contracts

- **Goal:** Give clients typed synchronization and truthful acceptance/status semantics.
- **Location:** `api/src/users/presentation/users.controller.ts`, `user-response.dto.ts`, **new** deletion DTO; `api/src/authentication/`; `api/src/http/`, `api/src/docs/`; `api/test/users.e2e-spec.ts`; `api/docs/openapi.yaml` and `openapi.json`.
- **Changes:** Extend profile projection/read with photo and lifecycle status. Keep PUT provider-derived with no trusted client identity fields. Implement 202/Location/pending, completed-only 204, restricted initiating-session GET with exact status-only response/no-store and idempotent retry routing. Add live credential verification to the restricted protocol without allowing it to provision. Define documented deletion errors for all blocked routes; verify configured provider failures cannot create a false completed status. Generate contracts from DTO/controller metadata.
- **Verification:** HTTP tests for unprovisioned/active/pending/completed, repeated DELETE, wrong identity/session, revoked session, provider outage and no financial/profile leakage. Inspect generated responses/headers and run OpenAPI generation/check.
- **Dependencies:** Tasks 1–3.

### Task 5: Propagate current identities without changing attribution

- **Goal:** Show current name/photo and safe Deleted user attribution everywhere required.
- **Location:** `api/src/spaces/application/space-store.ts`, `infrastructure/typeorm-space-store.ts`, presentation DTOs; `mobile-app/src/application/spaces/active-space.ts`, `src/api/spaces-api-client.ts`; `src/features/sharing/shared-space-card.tsx`, `src/features/expenses/use-expense-detail.ts`, `detail-view.tsx`, `src/features/statement-import-history/`.
- **Changes:** Add current photo to member/attribution projection and runtime decoders. Resolve former actors from authorized Shared records to sanitized tombstones after membership removal. Keep actual membership count/card semantics separate from former-contributor attribution. Refresh the projection after profile synchronization and on existing focus/refresh paths; reuse it for Added By, Activity and importer labels/avatars with safe unavailable/loading fallbacks. Preserve all actor IDs, evidence JSON, amounts and immutable confirmation results. Never resolve names by email.
- **Verification:** Rename/change photo, inspect preexisting Expense/Activity/import and Shared card; then delete and inspect retained active/old archives as the other member. Verify Deleted user/no photo/no email, unchanged history/results, no restored access and accurate remaining member count.
- **Dependencies:** Tasks 1–4.

### Task 6: Build provider-owned native profile editing

- **Goal:** Provide editable name/photo with accurate partial-save/sync recovery.
- **Location:** Profile route; **new** `mobile-app/src/features/profile/` adapter/workflow/controller/view and `src/app/(app)/edit-profile.tsx`; `src/api/user-api-client.ts`; `mobile-app/package.json`, lockfile, `app.json`; app route registration.
- **Changes:** Implement section 3 editor/step tracking and validated GET/PUT User decoding. Add compatible ImagePicker/config, one image-library selection, native upload adapter and private image lifecycle. Save provider changes then synchronize; preserve failed values and allow synchronization-only retry. Scope async completions to Clerk identity/session and workflow generation. Profile remains readable with existing Appearance/Sharing behavior; no email input.
- **Verification:** Core workflow/adapter tests for cancellation, provider rejection, name-success/photo-failure, provider-success/API-failure, sync-only retry and obsolete completions. Native check selected image upload, cancellation/permission denial, temp cleanup and successful name/photo propagation.
- **Dependencies:** Tasks 4–5.

### Task 7: Add account-level deletion workflow and transport

- **Goal:** Survive response loss, app navigation and auth changes without false completion or reprovisioning.
- **Location:** **new** `mobile-app/src/features/account-deletion/` workflow/intent storage/controller; `src/api/user-api-client.ts`, `authorized-request.ts`; `src/application/authorized-client.ts`, `session.ts`, `session-runtime.ts`, `src/app/_layout.tsx`; `src/application/spaces/provider.tsx`.
- **Changes:** Implement section 3 states, durable minimal intent-before-send and restart reconciliation above financial providers. Decode HTTP status/Location rather than treating every 2xx identically; extend the transport with a narrow response-metadata option if needed while preserving existing clients. Gate uncertain/accepted identities, keep deletion-status credentials independent of Space/session clearing and prevent normal Clerk observation from resurrecting accepted identity. Route authoritative deletion errors into cleanup rather than same-owner expiry recovery. A generic 401 alone remains ambiguous; revalidate Clerk session/identity on recovery before retaining drafts. Treat confirmed revocation/deletion as cleanup, preserving ordinary temporary-expiry recovery when validity is established. Check current credential binding before accepting every response.
- **Verification:** Workflow tests cover delayed 202, lost response, status 404 before acceptance, repeated DELETE, restart, Space change, sign-out before completion, status 401, accepted cleanup followed by unchanged Clerk identity and a new identity. No automatic financial replay or pending-to-completed inference.
- **Dependencies:** Task 4; integrate with Task 6.

### Task 8: Complete private cleanup and account UI

- **Goal:** Make deletion reviewable and prevent private state from reappearing.
- **Location:** **new** Account settings route/view under `mobile-app/src/app/(app)/` and deletion feature; Profile route, app layouts; `src/application/session.ts`, `session-runtime.ts`, `session-request.ts`; `src/features/statement-import/confirmation-receipt.ts`, import stores/extraction host; `src/navigation/device-memory.ts`; image adapter from Task 6; `mobile-app/design/design-token.md`.
- **Changes:** Wire explicit settings/confirmation and all pending/failure/uncertain/completed surfaces. Invoke `acceptedAccountDeletion()` on accepted response or authoritative deletion signal; preserve cleanup errors as retryable gates. Extend cleanup ownership to financial caches, selected-space memory, drafts, app-created PDF/password resources and profile image copies. Serialize deletion against late receipt/image writes; invalidate generations before cleanup. Keep Appearance preference. Run cleanup outside a route lifetime so closing the UI cannot interrupt it. Clear other sessions' private state when revocation/deletion is established; do not promise remote erasure of offline devices. Document source-node adaptations and exact pending/sign-out copy.
- **Verification:** Existing receipt/session tests plus delayed responses/storage writes/extraction/photo completion after cleanup and failed cleanup/retry. Native confirmation Cancel preserves account; accepted Close/sign-out never cancels server work. Light/dark, narrow viewport, large text, keyboard/safe-area, TalkBack/VoiceOver focus, 48-unit targets and reduced motion checks.
- **Dependencies:** Tasks 6–7.

### Task 9: Record end-to-end evidence and operational handoff

- **Goal:** Establish actual completion and make retry/recovery operable.
- **Location:** Existing API User/Space/import PostgreSQL suites, `api/scripts/run-required-postgres-tests.mjs` only if an additional isolated database is required; mobile core tests/package test list; `api/README.md`, `api/ARCHITECTURE.md`, `api/docs/DATABASE_DESIGN.md`, `api/docs/LOCAL_TESTING.md`, `mobile-app/README.md`; **new** issue-156 verification report in `docs/agents/implementation/`.
- **Changes:** Add focused HTTP/PostgreSQL deletion integration tests using an existing isolated suite database where practical; include them in mandatory test execution. Document worker startup/defaults, due/stalled-operation inspection and safe retry with no profile data logging. Update shipped contract documentation and native build requirements. Record dedicated-identity provider evidence and Android/iPhone acceptance separately, including blockers. Do not claim device acceptance from unit checks or expose private screenshots/credentials.
- **Verification:** Execute section 5 gates, map remaining manual evidence explicitly and inspect final diff for scope/privacy.
- **Dependencies:** Tasks 1–8.

## 5. Testing and Validation

Prioritize the core transitions and real database ordering; do not add snapshot tests for every view.

| Critical scenario | Required evidence |
| --- | --- |
| Provider update succeeds, API sync fails | Retry sync only; no false rollback/saved claim; old history refreshes after success. |
| Acceptance vs writes/provision/invitation | PostgreSQL barriers test both orderings, including a request paused after guard resolution and a provider read paused before provisioning commit. No partial import/configuration or restored membership/defaults. |
| Outage/crash/response loss | Accepted operation persists; stop app and restart API; retry stage after external success-before-checkpoint; two workers converge; no completion until all checkpoints. |
| Physical removal/retention | Populate every Personal financial table including soft deletes and failed/successful operations; SQL asserts zero Personal records and unchanged Shared originals/results in all archives. No deleted profile in notifications/attribution. |
| Identity fence/fresh registration | Old token/old provider ID cannot read/write/provision after acceptance/completion; new provider ID with same email gets default Categories and no previous history/access. |
| Local lifecycle | Pending, uncertain and sign-out remain distinct; cleanup failure blocks UI, retry works, stale requests/receipt writes cannot restore state; confirmed revocation in another session clears private state. |

From `api/`: `npm test -- --runInBand`, `npm run test:postgres` (all ten existing unique test database URLs required), `npm run build`, read-only `npx eslint "{src,apps,libs,test}/**/*.ts"`, `npm run openapi:generate`, `npm run openapi:check`. Add focused test-path invocations while iterating. Use only explicitly selected disposable databases; no developer-data reset.

From `mobile-app/`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run parser:test` when import cleanup/extraction changes. Add new core tests to the explicit `test` script. Build native development clients after ImagePicker/config changes and follow `docs/local-testing.md`.

Use dedicated disposable Clerk identities, two Shared members and multiple sessions for real provider verification. Record image/name changes, provider/API outage, pending request followed by sign-out, eventual provider absence, session invalidity and SQL cleanup. Record Android and physical-iPhone results, light/dark/accessibility and any unexecuted device cases explicitly. This planning change runs no application tests or identity mutations.

## 6. Acceptance Criteria

1. Profile supports Clerk name/photo editing, read-only email, saving/partial-provider-failure/API-sync-failure and retry; API PUT trusts only provider truth (Tasks 1, 4, 6).
2. Current name/photo reaches Shared presentation, Added By, Activity and import history without modifying attribution IDs/evidence/results; deleted attribution has no old profile/email and no membership grant (Tasks 2, 5).
3. Explicit confirmation explains every account consequence; pre-submit cancellation sends no request; submitted, uncertain, accepted/pending, completed and signed-out states are truthful and distinct (Tasks 7–8).
4. Acceptance durably fences provisioning and all financial access, revokes invitations/claims and archives active Shared atomically with write ordering (Tasks 1–2, 4).
5. DELETE is idempotent with 202/Location or completed-only 204; initiating valid-session status returns only pending/completed with no-store (Task 4).
6. Provider/session/Personal cleanup finishes through outages/restarts without the app, retaining only safe progress/fencing and Shared tombstone references (Tasks 1–3, 9).
7. Surviving members keep authorized Shared history and old archives; old identity cannot re-provision, while same-email new registration inherits nothing (Tasks 2–5, 9).
8. Accepted deletion and observed revocation clear private state through the existing session seam; cleanup failures remain gated/retryable and late responses/writes cannot resurrect state (Tasks 7–8).
9. Design adaptations preserve existing Appearance/Sharing and native accessibility; remaining device/provider verification is recorded explicitly (Tasks 6, 8–9).

## 7. Assumptions and Open Questions

- Proposed field/error names, retry defaults, native first/last-name editor and indefinite minimal old-ID retention are implementation choices filling unspecified details, not claims about shipped APIs. No product ambiguity blocks this plan.
- Clerk `@clerk/expo` ^4.14.1 / `@clerk/backend` ^3.16.13 and Expo ~58.0.16 are declared in this checkout. Verify locked SDK types, instance name/photo settings, native image input, session pagination and provider-deletion session semantics in Task 3/6; resolve incompatibility before marking those tasks complete.
- The deployment must keep an API instance running for reconciliation. If it can scale to zero, provide a scheduled invocation of the same worker before release; no mobile-triggered-only fallback meets acceptance.
- Status availability can end before final completion, as required by the accepted contract. Do not add an unauthenticated completion lookup or retain tokens merely to guarantee a completed screen.
