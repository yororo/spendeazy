# Isolated local synthetic identity

Automated API testing may use synthetic User identities without contacting Clerk, but it must exercise the real authorization, provisioning and persistence paths against a fresh disposable PostgreSQL database. The synthetic identity exists only in automated test configuration; it is never a production credential or a way to select a User in the app.

Physical-device authentication checks use dedicated development Google/Clerk identities and a device-reachable test API. They do not use the synthetic test path or an ordinary financial database. This keeps API automation repeatable while preserving real sign-in as a separate native acceptance gate.
