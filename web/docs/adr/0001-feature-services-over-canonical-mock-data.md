---
status: superseded
---

# Feature services over canonical mock data

Until the HTTP backend is available, feature-owned asynchronous services project their endpoint-specific read models from one lazy-loaded JSON source. This replaces independent slice fixtures because Dashboard, Categories, Transactions, and Statement Import must agree on financial facts, while retaining the service boundaries that will be replaced by HTTP calls and preventing pages from depending on the temporary storage shape.

The canonical source added shared mock-only schema and projection work while the HTTP backend was unavailable. It is no longer current: all runtime feature services now use the authenticated API boundary, and the mock-data source has been removed.
