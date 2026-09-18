# Authenticated self-scoped API boundary

Spendeazy accesses private API resources only through the current Clerk session and self-scoped `/api/v1/users/me` operations. The authenticated application boundary obtains a current session token, provisions or synchronizes the User before business queries mount, isolates cached data per Clerk session, and coordinates bounded token-refresh and provisioning recovery; this central boundary was chosen over feature-local authentication and lazy provisioning so ownership cannot depend on client-supplied internal User identifiers and concurrent requests follow one recovery policy.

