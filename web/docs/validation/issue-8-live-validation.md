# Issue #8 live validation

Validation date: 2026-08-30 (UTC)

## Scope and safety

The local API at `http://localhost:3000` was healthy and reported a ready database. The configured development user (`Dev User`, API ID `1`) was read only and was not changed.

All live mutations used this newly created, isolated API user:

- Name: `Issue #8 live validation 1788087968338`
- API user ID: `2`
- Email: `spendeazy-issue-8-validation-1788087968338@example.invalid`

Created records are intentionally retained because the API does not provide deletion for them:

- Category `16`: `Issue 8 Validation Category 1788087968338`
- Category Rule `2`: exact pattern `ISSUE 8 VALIDATION MERCHANT 1788087968338`
- Statement Import `2`: one committed Transaction
- Statement Import `3`: one probable duplicate committed after explicit acknowledgement

## Direct API results

- `GET /health`: `200`, database ready.
- Validation user, Categories, Category Rules, monthly Category Summary, Statement Import item, and Statement Import history reads: all `200`.
- Transaction cursor loading with `pageSize=1`: two `200` pages; the first returned a `nextCursor`.
- `OPTIONS /api/v1/users/2/categories` from `http://localhost:5173`: `204`, with the expected frontend origin and API methods allowed.
- Re-submitting the first file hash: `409 STATEMENT_IMPORT_FILE_ALREADY_EXISTS`.
- Re-submitting the same Transaction with a new file hash: `409 STATEMENT_IMPORT_PROBABLE_DUPLICATES`.
- Retrying that probable duplicate with `acknowledgeProbableDuplicates=true`: `201`, creating immutable Statement Import `3`.
- The monthly Category Summary and Statement Import history both included the created Category and both committed Statement Imports.

## Repository checks

- No runtime source references the retired canonical mock-data module; the mock data, loader, temporary file, and mock-only types are absent.
- Feature services remain the API-to-read-model boundary for Dashboard, Transactions, Categories, and Statement Import.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed — 6 files, 44 tests.

## Browser validation

The browser-control surface was unavailable in this session (`0` browser connections), so route-level browser checks were not run. The remaining browser checklist is: authenticated route loading/error/empty states, Reporting Period changes, cursor “Load more”, Account presentation, Statement Import completion and refresh, CORS from the Vite origin, and duplicate recovery. Direct API checks above cover the corresponding persisted-data, cursor, CORS, and duplicate contracts without mutating any existing user.
