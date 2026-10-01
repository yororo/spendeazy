# Dashboard theme prototype — throwaway

Question: how does the current Dashboard feel with the **Dashboard — Monthly
Expenses — Playful Theme - muted** treatment from `design/ui-design.pen`?

This is a theme comparison on the existing Dashboard, rather than a layout
exploration. The reference supplies Nunito typography and rounded panels. The
requested refinement simplifies its palette to cool neutral and pale blue surfaces
with blue actions and charts. Current Dashboard content,
financial calculations, Category Colors, and responsive structure are retained.

From `web/`, run `npm run prototype:dashboard` with the normal development
environment configured. The Dashboard uses the existing authentication and queries.
Alternatively, run `node scripts/local-test-launcher.mjs` from repository root
and open `http://127.0.0.1:5174/?variant=muted` for fictional local-test data.
Choose a populated Reporting Period if the current month has no Transactions.

- `/?variant=muted`: muted Playful theme.
- `/?variant=technical`: current theme baseline, retaining selected appearance.
- No variant: ordinary Dashboard.

The floating control and left/right keyboard arrows switch variants. Form controls
retain their own arrow behavior. URL selection is reload-stable; no theme preference
is saved. The prototype activates only in development. Existing app navigation and
financial workflows remain functional; this introduces no new mutations.

Validation: web lint, build, and 640 tests passed; isolated integration suite passed
56 browser tests and three PostgreSQL rollback tests. Visually checked at 1440px
and 390px; measured no horizontal overflow at 320px and 390px. Button and keyboard
switching verified against the synthetic local-test environment.

Verdict: ready for visual evaluation; no production theme decision has been made.
Saved on `codex/prototype-dashboard-muted`; no originating issue was supplied.
