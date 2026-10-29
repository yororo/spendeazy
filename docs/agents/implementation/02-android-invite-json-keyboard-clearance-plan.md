# Implementation Plan: Android Invite Creation and Keyboard Clearance

## 1. Overview

- **Objective:** Fix F01 (Invite Code creation fails with a JSON media-type error) and F02 (Save Expense remains behind the Android keyboard at narrow width/large text), recorded in the [Android acceptance results](../../implementation-plan.md#android-emulator-findings--2026-10-29).
- **Scope:** Mobile invitation request payloads, focused adapter regression tests, the shared form screen's Android keyboard handling, and native retesting. Include Rotate and Accept because they have the same request defect as Create.
- **Constraints:** Preserve authentication, invitation ownership/eligibility, explicit acceptance, Expense validation, exact PHP values, draft retention, navigation and iOS behavior. No API/security relaxation, database migration, new dependency, redesign or generated-native-file edits. F03 (System Appearance) and F04 (development linking warning) are separate follow-ups.

All source paths below are repository-relative. This document plans work only; it does not claim either defect is fixed.

## 2. Current State

| Area | Verified behavior and ownership |
| --- | --- |
| Invitation requests | `mobile-app/src/api/invitations-api-client.ts` sends Create, Rotate and Accept as POST without a body. Claim already sends `{ code }`; Revoke/Decline use DELETE. |
| HTTP helper | `mobile-app/src/api/authorized-request.ts` serializes supplied bodies and adds `Content-Type: application/json` only when a body is supplied. Authorization, session execution and response decoding are centralized here. |
| Published API | The [OpenAPI contract](../../api/docs/openapi.yaml) declares Create's required JSON body using an empty `CreateInvitationDto` schema. Existing server enforcement also requires JSON content type for POST, including Rotate/Accept. The Android Create attempt failed twice with `Request bodies must use application/json`. |
| Tests | `mobile-app/src/api/invitations-api-client.test.ts` covers inbox, Claim/Accept decoding, no-content deletion and malformed responses, but does not enforce JSON headers/payloads for Create/Rotate/Accept. `authorized-request.test.ts` covers authentication/transport/response failures. |
| Form layout | `mobile-app/src/features/expenses/manual-view.tsx` renders fields and Save inside `Screen`. `mobile-app/src/components/screen.tsx` wraps a flex ScrollView in KeyboardAvoidingView, with `padding` on iOS and no behavior on Android. It already supplies safe-area/navigation bottom padding and `keyboardShouldPersistTaps="handled"`. |
| Reproduction | On Android 17/API 37, 420 dpi, viewport 840 × 1680 physical (320 × 640 logical), font scale 1.5, Light: focus Add Expense Description, type fictional text, keep keyboard open and scroll to the bottom. Save remains obscured; hiding keyboard restores access. |
| Related shells/config | `mobile-app/src/components/choice-sheet.tsx` owns Category sheets/Edit dialogs; `mobile-app/src/features/expenses/browse-view.tsx` owns a separate list wrapper. `mobile-app/app.json` locks portrait and does not override Android keyboard layout mode. Dependencies are Expo ~58.0.16 / React Native 0.88.0. |

## 3. Proposed Solution

**F01:** Supply `body: {}` explicitly for Create, Rotate and Accept in the invitation adapter. The existing helper will serialize valid JSON and set the correct header. Keep Claim's payload, GET/DELETE behavior and the shared transport unchanged. This is smaller than changing header/body policy for every API client and preserves server enforcement.

**F02:** Set an explicit Android `height` behavior in the existing `Screen` KeyboardAvoidingView, preserving iOS `padding`. Keep the ScrollView flex-bounded so the keyboard reduces its usable viewport and the final action can scroll into view. Retain existing safe-area padding and tap handling; do not add a fixed keyboard spacer or dismiss the keyboard as the fix. Treat `height` as the proposed implementation requiring native proof, not an already verified solution.

Official references reviewed for this plan:

- [React Native KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview): explicit behavior is recommended on both platforms; behavior differs by platform.
- [React Native ScrollView](https://reactnative.dev/docs/scrollview): scrolling requires bounded height through the parent hierarchy.
- [Expo SDK 58 app configuration](https://docs.expo.dev/versions/v58.0.0/config/app/#softwarekeyboardlayoutmode): Android keyboard mode defaults to `resize`. Do not assume the installed development binary matches current configuration; inspect its effective mode if the layout fix fails.

Do not preemptively change modal/list shells or native configuration. If native reproduction still fails after the Screen change, inspect the actual screen/keyboard bounds and installed soft-input behavior before adjusting the same layout owner. A native setting change requires app config and a rebuilt client following the [local runbook](../local-testing.md), never a hand-edited Android manifest. Do not stack multiple keyboard compensation mechanisms.

## 4. Implementation Tasks

### Task 1: Align invitation POST payloads and cover the regression

- **Goal:** Create, Rotate and Accept reach the API with JSON requests.
- **Location:** `mobile-app/src/api/invitations-api-client.ts`, `mobile-app/src/api/invitations-api-client.test.ts`; inspect `authorized-request.ts` without changing its policy.
- **Changes:** Add empty-object bodies to those three calls. Extend the existing fetch-mock tests with valid outgoing-invitation and accepted-Space fixtures. Assert each operation's endpoint/method, JSON content type and parsed empty-object body, as well as the decoded result. Retain coverage for Claim's `{ code }` and Revoke/Decline's 204 handling. Do not log tokens or real Invite Codes.
- **Verification:** Tests should expose the missing payload/header before the fix and pass afterward. Existing authentication, obsolete-session and failure-decoding tests must continue to pass. No backend change is expected.
- **Dependency:** None.

### Task 2: Make the Android form viewport respond to the keyboard

- **Goal:** Save Expense is scrollable into view and tappable while the keyboard remains open.
- **Location:** `mobile-app/src/components/screen.tsx`; exercise consumers in `mobile-app/src/features/expenses/manual-view.tsx` and `mobile-app/src/features/expenses/detail-view.tsx`, and modal handoffs in `mobile-app/src/components/choice-sheet.tsx`.
- **Changes:** Apply Android `height` / iOS `padding` behavior at the existing wrapper. Preserve flex bounds, canvas, safe areas, bottom navigation clearance and draft/controller ownership. Keep changes in Screen unless a reproduced regression demonstrates another owner needs adjustment. No new layout abstraction or keyboard dependency.
- **Verification:** Repeat F02 exactly on the running Android development client. With Description and then Date focused, scroll until Save is fully visible above the keyboard and submit a valid fictional Expense. Confirm ordinary-width/default-text behavior and no excessive blank space after keyboard dismissal. Use native checks rather than a snapshot test that merely asserts a prop value.
- **Dependency:** Independent of Task 1; both precede final acceptance.

### Task 3: Retest both fixes and update acceptance evidence

- **Goal:** Record actual native results and any remaining gaps.
- **Location:** Root `implementation-plan.md`, its `agent testing status - android emulator` column and F01/F02 findings; follow `docs/local-testing.md`.
- **Changes:** Retest the scenarios below, retain the original reproduction history, and append dated outcomes with tested revision/build, viewport, font scale and remaining coverage. Update V11 and V05/V14 only for scenarios actually exercised; do not mark whole rows passed because one defect is fixed. Keep F03/F04 open. Restore emulator settings and document fictional data cleanup/retention.
- **Verification:** Create produces a displayed/retrievable code; Rotate replaces it; Revoke clears it. With two dedicated test accounts, Claim previews without joining and explicit Accept returns the Shared Space without a media-type error. Run the keyboard and modal checks below. Record unavailable second-account/iPhone checks as pending.
- **Dependency:** Tasks 1 and 2.

## 5. Testing and Validation

From `mobile-app/`, run the focused regression tests during development:

```sh
node --experimental-strip-types --test src/api/invitations-api-client.test.ts src/api/authorized-request.test.ts
```

After the final code changes, run once:

```sh
npm test
npm run lint
npm run typecheck
```

Required manual checks:

| Check | Expected result |
| --- | --- |
| Create → return/reopen Sharing → Rotate → Revoke | Correct invitation state, no JSON media-type error, readable failure handling; refresh can retrieve the created code. Copy remains usable. |
| Claim → explicit Accept with second test account | Claim does not create membership; Accept succeeds under existing eligibility rules. Do not send messages or invitations to real contacts. |
| Add Expense at 320 × 640 / font scale 1.5 | Save reachable above the open keyboard after scrolling; successful save occurs once with exact amount/date/Category. |
| Default width plus 360 width; font scale 1.0/1.5; Light/Dark | Form fields and actions remain readable, keyboard dismissal restores layout, no doubled bottom spacing. |
| Add/Edit → Category → dismiss/select | One active modal; Android Back behaves sensibly; draft fields survive canceled selection. Edit save remains usable. |
| Category editor and Sharing code field | Shared Screen change does not strand their bottom actions; tab navigation and non-form screen scrolling remain usable. |
| iPhone smoke check when available | Existing iOS padding behavior and keyboard/modal flows remain intact; unavailable device is explicitly pending. |

Do not add automated screenshot infrastructure or broaden to parser certification. JavaScript-only changes use reload/Fast Refresh; rebuild only if a verified native configuration change becomes necessary.

## 6. Acceptance Criteria

- Create, Rotate and Accept send JSON empty-object bodies and pass focused adapter regression tests without altering shared authentication or server validation.
- The original Android F01 reproduction creates a usable Invite Code; downstream invitation operations have no recurrence of the same media-type defect.
- The original F02 reproduction can expose and activate Save Expense while the keyboard stays open; hiding the keyboard is not required as a workaround.
- Draft retention, exact Expense values, modal handoffs and existing iOS behavior are preserved; static checks and native evidence are recorded separately.
- Acceptance documentation identifies tested revision/device/settings, cleanup and all pending combinations; no unrelated findings are silently closed.

## 7. Assumptions and Open Questions

- F01/F02 are the local acceptance finding identifiers, not verified GitHub issue numbers.
- Installed native-build provenance was not established in the original run. Reconfirm the current F02 reproduction and effective keyboard mode before accepting the proposed layout correction.
- A second development account and iPhone may not be available. Mocked adapter checks can verify request format but do not establish native two-user/iPhone acceptance.
- Portrait is intentional in current app config; enabling landscape is outside these fixes.
