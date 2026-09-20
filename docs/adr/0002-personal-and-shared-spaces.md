# Separate financial ownership into Personal and Shared Spaces

Design decisions and consolidated scope confirmed on 2026-09-20 during the grill-with-docs interview. The user requested specification publication; implementation has not started. The shared glossary records the agreed target vocabulary.

The implementation specification, including confirmed testing boundaries, is tracked in [GitHub issue #14](https://github.com/yororo/spendeazy/issues/14).

Financial data belongs to a Space, while each User retains their independent sign-in identity. Each User has a private Personal Space and at most one active Shared Space with one other User. This separates shared finances without exposing or merging either person's personal history; Account continues to mean a Transaction's payment source.

A Shared Space is created only when its invitation is accepted and both Users are still eligible. Invitations can be sent to email addresses whose recipients have not registered: those recipients must register before accepting. Acceptance requires a signed-in identity with the invited email verified, including a verified secondary email. Invitations appear by email and in-app once the recipient has an eligible identity. The existing identity integration synchronizes only primary verified emails, so supporting additional verified emails requires an implementation change.

Recipients who register with a different email must add and verify the invited email on their signed-in identity before accepting. Possession of a forwarded link alone cannot grant membership. Once associated with a verified recipient, the invitation remains bound to that User.

The invitation survives the registration flow, which creates the recipient's Personal Space. The recipient then explicitly accepts or declines on a screen naming the inviter and explaining the separate Shared Space. Registration succeeds even if the invitation has expired or been canceled. An unregistered recipient may decline through a confirmed action on a limited email-link invitation page without creating an identity; opening the link never changes invitation state.

Each User may have one outgoing pending invitation and multiple incoming invitations. Invitations expire after seven days, can be canceled or resent by the sender, and can be declined by the recipient. Resending invalidates the previous email link. Acceptance atomically creates the Shared Space and invalidates all other pending invitations involving either member. Pending invitations do not reserve membership.

Sending responses do not disclose whether the address is registered. Resends are limited to one per minute, with at most five invitation emails per sender per day. Resending restarts the seven-day expiration and invalidates the previous link. Delivery failures are visible to the sender with a retry action; delivery alone never creates membership.

New Shared Spaces contain default Categories and no Transactions, Budgets, or learned Category Rules. Categories, Budgets, Rules, Transactions, and Committed Statement Imports created within a Space belong to it; personal and shared data do not synchronize.

Both members have equal day-to-day authority, including editing and deleting Transactions added by the other. Transactions retain immutable Added By attribution, and Committed Statement Imports identify their importer. Transaction history preserves creation, edits with before/after values, and deletion events with actor and time, for manual and imported Transactions. Deleted Transactions are excluded from spending totals but remain inspectable through activity/history. Restoration and identifying who paid are outside this feature's initial scope.

Either member may leave after confirmation explaining that both lose editing access, which permanently archives the Shared Space as read-only history available to both. Both can subsequently form a new Shared Space. Archives have no automatic expiration and cannot be reopened. Identity deletion removes that person's access while preserving the other member's shared history with Deleted user attribution. Any future permanent shared-history deletion requires both members' agreement. This avoids giving either member unilateral control over the other's access to their shared history.

The UI persistently identifies the active Space using explicit Personal or Shared text and offers a Space switcher above desktop navigation and directly in the mobile header, with member avatars and optional reinforcing color. Initial labels are Personal followed by the User's name and Shared followed by the member names; archived Spaces have a separate history entry. Shared Transaction rows show Added By. The last active Personal or Shared Space is restored per device, with Personal as the fallback when unavailable; existing tabs retain independent selections.

Switching Spaces requires finishing or explicitly discarding unsaved work. Import review and confirmation identify the destination Space. Submitted operations retain their original destination despite subsequent switches, and archived Spaces reject new writes.

Archiving notifies the other member in-app and by email. If that member is working, their next save fails clearly and preserves unsaved work on screen long enough to inspect or copy it; it is never silently redirected into Personal. Writes completed before archiving remain in the archive.

Duplicate checks apply only within the destination Space, across both members' shared imports. The same statement may exist independently in Personal and Shared Spaces without cross-Space duplicate warnings.

Import confirmation revalidates Category eligibility and duplicate checks. Relevant changes preserve the review and identify the corrections needed before committing all selected Transactions atomically. Category Rule changes affect future categorization without silently rewriting reviewed assignments.

Stale edits to Transactions, Categories, Budgets, and Category Rules are rejected with a request to reload and review instead of silently overwriting another save. Other members' changes refresh on navigation or window focus; instant live updates are deferred.

At rollout, existing Categories, Budgets, Transactions, Rules, and Committed Statement Imports move into their owner's Personal Space while preserving identifiers and relationships. Existing Transactions are attributed to that User. Detailed change history starts at rollout, without fabricated historical edits.

The implementation now scopes Categories, Budgets, and Category Rules to explicit authorized Spaces, while retaining legacy personal routes as compatibility shims. Statement Import persistence and the remaining financial records continue to move under this boundary through the implementation work tracked in [GitHub issue #14](https://github.com/yororo/spendeazy/issues/14) and its decomposed issues. Category Rule storage and replacement follow the superseding [API Category Rule ADR](../../api/docs/adr/0003-category-rule-storage-and-replacement.md): rule mutations are Space-scoped and detect stale edits. This decision also extends the ownership boundary in [the web authentication ADR](../../web/docs/adr/0002-authenticated-self-scoped-api-boundary.md) to authorized Spaces while preserving independent session identities and centralized authentication.
