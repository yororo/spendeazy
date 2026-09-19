# Isolated local synthetic identity

Accepted design (2026-09-19); implementation has not started.

Local manual testing and isolated CI will run the real web app, API, and database with a synthetic identity, without requiring Clerk accounts, sign-in, or credentials. Replacing only the external identity boundary preserves meaningful coverage of provisioning, persistence, and User ownership; browser-only API mocks would not provide that coverage.

This mode must be rejected in production and must never connect to the real financial database. Remotely accessible previews are outside its scope. Real Clerk sign-in verification remains separate coverage; synthetic identity tests cannot establish that the Clerk integration works.

Manual test data persists across runs and has an explicit reset command; automated E2E runs use fresh, isolated data. A dedicated PostgreSQL container, managed by the test launcher with separate credentials and storage, is an accepted prerequisite. Ordinary development database settings are not used by this mode.

Initial scenarios include a populated User, a new User for first-time provisioning, a second User with distinct data for ownership checks, and signed-out and expired-session states. Initial delivery includes one-command startup and a small Playwright suite covering provisioning, saving and reloading a Transaction, and User isolation, alongside manual and agent-driven browser testing.

This introduces an explicit testing exception to the Clerk-only identity source in [the web authentication ADR](../../web/docs/adr/0002-authenticated-self-scoped-api-boundary.md), while retaining its session-cache isolation, centralized provisioning and recovery, and self-scoped API rules. Production continues to use Clerk.

The browser opens as the populated User and provides a clearly marked local testing panel for switching Users, signing out, and simulating expiration. Switching clears the previous session's cached data; selecting the new-User scenario creates a fresh identity. Expiration controls separately exercise an expired token with successful refresh and a revoked session whose refresh fails and returns the browser to signed-out state.

A dedicated test launcher and entry point, excluded from production artifacts, select synthetic authentication. Servers bind to loopback, database configuration belongs to the launcher, and session credentials are temporary. Neither a browser flag nor an arbitrary User ID enables authentication. The synthetic verifier and profile provider replace the external identity boundary while real guards, provisioning, ownership enforcement, and persistence continue to run.

Manual fixtures use clearly fictional financial data dated relative to the current month. Automated tests use deterministic fixtures and a fixed clock. An explicit reset affects only the dedicated test environment; ordinary startup preserves manual changes.

The design interview is complete and the user confirmed the consolidated scope. The user requested specification publication only and explicitly deferred implementation.

The implementation specification is tracked in [GitHub issue #8](https://github.com/yororo/spendeazy/issues/8).
