# On-device statement parser proof

This is a native mobile parser prototype, not a completed expense-import journey. It establishes a local PDF selection/unlock/extraction and provider-interpretation experiment. It does not implement the accepted Expense API contract, reporting, or save/confirmation flow. See the accepted [mobile Expense contract](../../../../docs/specifications/mobile-expense-domain-api.md) and remaining [parser launch gates in issue #138](https://github.com/yororo/spendeazy/issues/138).

## Implementation

- `screen.tsx` uses the native document picker and password flow, runs PDF extraction in a restricted local React Native WebView, and shows parsed proof output.
- `extraction.ts` coordinates the native/WebView boundary and operation lifecycle. `webview-entry.ts` extracts page-indexed text from local PDF bytes using the bundled `pdfjs-dist` package.
- `providers/` interprets supported provider statements after extraction. Extraction and interpretation are separate; successful text extraction does not prove that every statement layout reconciles.
- `rules.ts` applies the local Category Rule prototype. Matching is intended to remain on-device in the accepted contract.
- `scripts/build-parser-proof.mjs` bundles the local PDF.js worker. `scripts/parser-proof-regression.test.mjs` uses fictional fixtures for parser/provider behavior. `scripts/inspect-parser-proof.mjs` is a local metadata-only diagnostic; it does not provide native-device acceptance evidence.

The current dependency baseline is PDF.js `5.4.296` and `react-native-webview` `14.0.1`. The source PDF and entered password remain on-device. Do not add statements, passwords, tokens or private screenshots to the repository or issue tracker.

## Local checks

Use the shared [manual runbook](../../../../docs/local-testing.md) to prepare assets and open `/parser-proof` in the native development build.

Run from `mobile-app/`:

```powershell
npm run parser:test
npm run lint
npm run typecheck
```

The regression suite proves deterministic behavior on its fictional fixtures. Lint, type checks, parser fixtures, and debug builds do not certify native-device behavior or supported-device resource limits.

## Existing device observations

These observations are inputs to the remaining acceptance work, not certification of the complete product:

- User-reported physical iPhone testing includes BDO, GCash and corrected EastWest samples, plus wrong-password retry, cancel/reselect, background/reopen and force-close/reopen behavior. The later confirmation did not include new screenshots, independent filesystem inspection, or reusable expected ledgers.
- An Android 16 / API 36 Pixel 9 Pro x86_64 emulator ran the release variant with airplane mode enabled before cold launch. The normal picker/password flow extracted the fictional six-page BDO sample as 46 Transactions in 1,007 ms. A 100-page fictional cancellation followed by BDO retry completed in 1,212 ms. These timings do not establish worst-case time or peak memory.
- Point-in-time release-emulator process-memory observations were recorded, but continuous peak sampling, low-memory physical Android support, older OS/WebView floors, maximum supported document bounds, and stale temporary-file cleanup remain unverified.

Private source statements and screenshots remain local. The original experimental notes and sanitized evidence are retained in the task history; this summary intentionally makes the unresolved gates explicit.

## Launch gates

Issue #138 owns parser input/resource limits, older-device and OS/WebView support, and temporary-file cleanup. Complete its approved measurements and device checks before launch. Also validate provider completeness and direction against independently reviewed expected ledgers through the supported native flows. Do not treat desktop/browser runs, CI, lint, types or parser fixtures as substitutes for Android emulator and physical iPhone evidence.
