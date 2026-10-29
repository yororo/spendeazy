import assert from 'node:assert/strict';
import test from 'node:test';
import { createCategoriesApiClient, type SpaceCategory } from '../../api/categories-api-client.ts';
import { createSession } from '../../application/session.ts';
import type { ImportResult, ImportRow } from './import-model.ts';
import type { ReviewCatalog, ReviewState } from './review-model.ts';
import { initializeReview, reviewReducer as reduce } from './review-state.ts';
import { editorDirty, normalizeReviewText, reviewCatalog, unmappedRows, validateReview, validPattern } from './review-rules.ts';
import { loadReviewCatalog } from './review-catalog-loader.ts';

const now = new Date('2026-10-29T12:00:00Z');
const category = (id: string, isActive = true): SpaceCategory => ({ id, name: id, isActive, revision: '1', iconKey: 'coffee', colorKey: 'cocoa' });
const catalog = (rules: ReviewCatalog['rules'] = []): ReviewCatalog => ({ spaceId: 'personal', categories: [category('food'), category('travel'), category('retired', false)], rules, rulesRevision: '2' });
const rule = (id: string, categoryId: string, pattern: string, matchType: 'exact' | 'contains' = 'exact') => ({ id, categoryId, pattern, matchType });
function fixture(): ImportResult {
  const row = (id: string, amount: bigint, classification: ImportRow['classification']): ImportRow => ({
    sourceRowId: id, pageIndex: 0, sourceOrder: Number(id), description: 'Cafe Luna', date: '2026-10-28', originalDate: '28 OCT',
    reference: null, originalAmount: amount.toString(), signedActivityMinor: amount, evidence: [{ kind: 'explicit-sign', value: '+' }], classification,
  });
  return {
    owner: { userId: 'ada', spaceId: 'personal' }, draftId: 'draft', file: { name: 'fictional.pdf', byteCount: 123, sha256: 'a'.repeat(64) },
    account: { provider: 'gcash', format: 'e-wallet', statementType: 'e-wallet' }, dates: { statementDate: null, historyPeriod: null },
    rows: [row('0', 100000n, { eligible: true, kind: 'purchase', expenseMinor: 100000n }),
      row('1', 30000n, { eligible: true, kind: 'outgoing-transfer', expenseMinor: 30000n }),
      ...(['payment', 'refund', 'cash-in', 'unknown-direction'] as const).map((reason, i) => row(String(i + 2), reason === 'refund' ? 20000n : 500000n, { eligible: false, reason }))],
    controls: [], recognitionEvidence: [], pages: [{ pageIndex: 0, outcome: 'text', hasImages: false }],
    completeness: { assessment: 'uncertain', failedPageIndices: [], unreadablePageIndices: [] },
    reconciliation: { outcome: 'unavailable', differenceMinor: null }, warnings: [{ code: 'uncertain-completeness', sourceRowIds: [], pageIndices: [] }],
  };
}
function ready(data = catalog()): ReviewState {
  const state = initializeReview(fixture());
  const request = { owner: state.original.owner, draftId: 'draft', generation: 1, id: 'request' };
  return reduce(reduce(state, { type: 'catalogRequested', request }), { type: 'catalogSucceeded', request, catalog: data });
}
function edit(state: ReviewState, values: Partial<NonNullable<ReviewState['editor']>['values']>, remember = false, pattern = 'Cafe Luna', mode: 'exact' | 'contains' = 'exact') {
  assert.ok(state.editor);
  return reduce(state, { type: 'editorChanged', editor: { ...state.editor, values: { ...state.editor.values, ...values }, remember, pattern, matchType: mode } });
}
const save = (state: ReviewState) => reduce(state, { type: 'saved', now, localId: `local-${state.revision}` });

test('matching uses lowercase whitespace normalization, punctuation, literal substring and Exact precedence', () => {
  assert.equal(normalizeReviewText('  CAFE\t Luna\n'), 'cafe luna');
  for (const [rules, expected] of [
    [[rule('1', 'food', ' CAFE\tLUNA ')], 'food'],
    [[rule('1', 'food', 'Cafe-Luna')], null],
    [[rule('1', 'food', 'afe', 'contains')], 'food'],
    [[rule('1', 'travel', 'luna', 'contains'), rule('2', 'food', 'cafe luna')], 'food'],
    [[rule('1', 'food', 'cafe luna'), rule('2', 'food', 'CAFE LUNA')], 'food'],
    [[rule('1', 'food', 'cafe luna'), rule('2', 'travel', 'cafe luna')], null],
    [[rule('1', 'retired', 'cafe luna'), rule('2', 'missing', 'cafe luna')], null],
  ] as const) assert.equal(ready(catalog(rules)).rows['0'].values.categoryId, expected);
  const matched = ready(catalog([rule('1', 'food', 'cafe luna')]));
  assert.equal(matched.rows['0'].assignment?.origin, 'rule');
  assert.equal(matched.rows['2'].values.categoryId, null);
});

test('tentative edits, filters, ledger correction and pending queue buffer stay independent', () => {
  let state = ready();
  state = edit(state, { amount: 'invalid', description: 'Unapplied' });
  const pending = state.editor;
  const applied = state.rows['0'];
  state = reduce(state, { type: 'filterChanged', filter: 'excluded' });
  assert.equal(state.editor, pending);
  state = reduce(state, { type: 'rowOpened', sourceRowId: '1' });
  assert.equal(state.pendingQueueEditor, pending);
  state = edit(state, { categoryId: 'travel', amount: '13.2', description: 'Corrected' });
  state = reduce(state, { type: 'queueReturned' });
  assert.equal(state.editor?.sourceRowId, '1'); // dirty ledger cannot silently disappear
  state = save(state);
  assert.equal(state.editor, pending);
  assert.equal(state.rows['0'], applied);
  assert.equal(state.rows['1'].values.amount, '13.20');
  assert.equal(state.rows['1'].assignment?.origin, 'manual');
  state = reduce(state, { type: 'rowOpened', sourceRowId: '1' });
  state = edit(state, { description: 'A different description' });
  state = save(state);
  assert.equal(state.rows['1'].values.categoryId, 'travel');
});

test('Skip defers an entire source ordered pass and does not masquerade as completion', () => {
  let state = edit(ready(), { categoryId: 'food' }, true);
  state = reduce(state, { type: 'skipped' });
  assert.equal(state.editor?.sourceRowId, '1');
  assert.equal(state.stagedRules.length, 0);
  state = reduce(state, { type: 'skipped' });
  assert.equal(state.editor, null);
  assert.equal(unmappedRows(state).length, 2);
  state = reduce(state, { type: 'skippedReviewed' });
  assert.equal(state.editor?.sourceRowId, '0');
  assert.equal(state.editor?.remember, false);
  state = save(edit(state, { categoryId: 'food' }));
  state = save(edit(state, { categoryId: 'travel' }));
  assert.equal(unmappedRows(state).length, 0);
  assert.equal(state.editor, null);
});

test('Rule conflicts are atomic, including inactive owners; duplicates are no-ops and modes distinct', () => {
  const conflicting = edit(ready(catalog([rule('old', 'retired', ' cafe luna ')])), { categoryId: 'food', amount: '22' }, true);
  const blocked = save(conflicting);
  assert.equal(blocked.rows, conflicting.rows);
  assert.equal(blocked.stagedRules.length, 0);
  assert.ok(blocked.errors?.length);
  let duplicate = ready(catalog([rule('old', 'food', 'cafe luna')]));
  duplicate = reduce(duplicate, { type: 'rowOpened', sourceRowId: '0' });
  duplicate = save(edit(duplicate, { categoryId: 'food' }, true));
  assert.equal(duplicate.stagedRules.length, 0);
  let distinct = edit(ready(catalog([rule('old', 'retired', 'Cafe Luna')])), { categoryId: 'food' }, true, 'Cafe Luna', 'contains');
  distinct = save(distinct);
  assert.equal(distinct.stagedRules.length, 1);
  assert.equal(distinct.rows['1'].values.categoryId, 'food');
  assert.equal(validPattern('😀'.repeat(500)), true);
  assert.equal(validPattern('😀'.repeat(501)), false);
  assert.equal(validPattern(' \n '), false);
});

test('exclude/restore preserve applied values; propagation preserves manual, mapped and omitted rows and original evidence', () => {
  const original = fixture();
  const before = structuredClone(original);
  let state = ready();
  state = reduce(state, { type: 'rowOpened', sourceRowId: '1' });
  state = save(edit(state, { categoryId: 'travel' }));
  state = edit(state, { categoryId: 'food', amount: '12' }, true);
  state = reduce(state, { type: 'excluded', sourceRowId: '0' });
  assert.equal(state.stagedRules.length, 0);
  assert.equal(state.rows['0'].values.amount, '1000.00');
  state = reduce(state, { type: 'restored', sourceRowId: '0' });
  state = save(edit(state, { categoryId: 'food' }, true));
  assert.equal(state.rows['1'].values.categoryId, 'travel');
  assert.equal(state.rows['2'].inclusion, 'locked-excluded');
  const locked = state;
  assert.equal(reduce(state, { type: 'restored', sourceRowId: '2' }), locked);
  assert.equal(reduce(state, { type: 'excluded', sourceRowId: '5' }), locked);
  state = reduce(state, { type: 'excluded', sourceRowId: '0' });
  assert.equal(state.stagedRules.length, 1);
  assert.deepEqual(state.original, before);
  assert.deepEqual(original, before);
});

test('refresh retains manual mappings, exposes inactive assignments and blocks work on failed reads', () => {
  let state = save(edit(ready(), { categoryId: 'food' }));
  const manual = state.rows['0'];
  const request = { owner: state.original.owner, draftId: 'draft', generation: 1, id: 'refresh' };
  state = reduce(state, { type: 'catalogRequested', request });
  const pending = state;
  assert.equal(reduce(state, { type: 'catalogSucceeded', request: { ...request, id: 'old' }, catalog: catalog() }), state);
  state = reduce(state, { type: 'catalogFailed', request });
  assert.equal(state.rows, pending.rows);
  assert.ok(save(state).errors?.length);
  assert.equal(validateReview(state, now).handoff, null);
  state = reduce(state, { type: 'catalogRequested', request });
  state = reduce(state, { type: 'catalogSucceeded', request, catalog: { ...catalog([rule('new', 'travel', 'cafe luna')]), categories: [category('travel')] } });
  assert.equal(state.rows['0'], manual);
  assert.ok(unmappedRows(state).some(row => row.sourceRowId === '0'));
  assert.equal(state.rows['1'].values.categoryId, 'travel');
});

test('Continue validates every included row outside filters and pending buffers, exact amounts and Manila dates', () => {
  let state = ready(catalog([rule('1', 'food', 'cafe luna')]));
  state = reduce(state, { type: 'filterChanged', filter: 'excluded' });
  for (const values of [{ amount: '0' }, { amount: '-1' }, { amount: '1.001' }, { description: ' \n ' },
    { expenseDate: '2026-02-29' }, { expenseDate: '2024-02-30' }, { expenseDate: '2026-10-30' }, { categoryId: 'retired' }, { categoryId: 'outside' }]) {
    const invalid = { ...state, rows: { ...state.rows, '0': { ...state.rows['0'], values: { ...state.rows['0'].values, ...values } } } };
    assert.ok(validateReview(invalid, now).issues.some(issue => issue.sourceRowId === '0'));
  }
  const wrongSpace = { ...state, catalog: { ...state.catalog, snapshot: { ...state.catalog.snapshot!, spaceId: 'wrong' } } };
  assert.equal(validateReview(wrongSpace, now).handoff, null);
  const midnight = { ...state, rows: { ...state.rows, '0': { ...state.rows['0'], values: { ...state.rows['0'].values, expenseDate: '2026-10-30' } } } };
  assert.equal(validateReview(midnight, new Date('2026-10-29T15:59:59Z')).handoff, null);
  assert.ok(validateReview(midnight, new Date('2026-10-29T16:00:00Z')).handoff);
  const leap = { ...state, rows: { ...state.rows, '0': { ...state.rows['0'], values: { ...state.rows['0'].values, expenseDate: '2024-02-29' } } } };
  assert.ok(validateReview(leap, now).handoff);
  state = reduce(state, { type: 'rowOpened', sourceRowId: '0' });
  state = edit(state, { amount: '2' });
  assert.ok(editorDirty(state, state.editor));
  state = reduce(state, { type: 'rowOpened', sourceRowId: '1' });
  assert.equal(validateReview(state, now).handoff, null);
  state = reduce(state, { type: 'queueReturned' });
  state = reduce(state, { type: 'editorAbandoned' });
  assert.ok(validateReview(state, now).handoff);
  state = reduce(reduce(state, { type: 'excluded', sourceRowId: '0' }), { type: 'excluded', sourceRowId: '1' });
  assert.equal(validateReview(state, now).handoff, null);
});

test('validated handoff is immutable, exact, source ordered and keeps all evidence; edits invalidate revision', () => {
  let state = save(edit(ready(), { categoryId: 'food', amount: '1000.01' }, true));
  const result = validateReview(state, now);
  assert.ok(result.handoff);
  assert.equal(result.handoff.rows[0].amount, '1000.01');
  assert.equal(result.handoff.rows[1].amount, '300.00');
  assert.equal(result.handoff.rows[2].amount, null);
  assert.deepEqual(result.handoff.original, fixture());
  assert.ok(Object.isFrozen(result.handoff.rows[0].values));
  assert.ok(Object.isFrozen(result.handoff.original.rows));
  assert.equal(result.handoff.original.rows[0].signedActivityMinor, 100000n);
  assert.deepEqual(result.handoff.rows.map(row => row.sourceRowId), ['0', '1', '2', '3', '4', '5']);
  const stale = { ...state, stagedRules: state.stagedRules.map(rule => ({ ...rule, rulesRevision: 'old' })) };
  assert.equal(validateReview(stale, now).handoff, null);
  const revision = state.revision;
  state = reduce(state, { type: 'continued', now });
  assert.ok(state.handoff);
  state = reduce(state, { type: 'rowOpened', sourceRowId: '0' });
  state = save(edit(state, { amount: '9.99' }));
  assert.equal(state.handoff, null);
  assert.ok(state.revision > revision);
  assert.equal(validateReview(state, now).handoff?.rows[0].amount, '9.99');
});

test('refresh rechecks staged keys and retains dirty buffers without creating dirtiness in untouched buffers', () => {
  let state = ready();
  state = reduce(state, { type: 'rowOpened', sourceRowId: '1' });
  state = save(edit(state, { categoryId: 'food' }, true));
  assert.equal(state.editor?.sourceRowId, '0');
  assert.equal(state.editor?.values.categoryId, 'food');
  assert.equal(editorDirty(state, state.editor), false);
  const request = { owner: state.original.owner, draftId: 'draft', generation: 1, id: 'refresh' };
  state = reduce(state, { type: 'catalogRequested', request });
  state = reduce(state, { type: 'catalogSucceeded', request, catalog: { ...catalog([rule('conflict', 'retired', 'Cafe Luna')]), rulesRevision: '3' } });
  assert.equal(state.stagedRules[0].rulesRevision, '3');
  assert.equal(validateReview(state, now).handoff, null);
  assert.ok(validateReview(state, now).issues.some(issue => issue.message.includes('conflicting')));
});

function owned() {
  const session = createSession(); session.observeIdentity('ada', 'first'); session.changeSpace('personal');
  const store = session.imports;
  const operation = { owner: fixture().owner, generation: session.capture().generation, id: 'extract' };
  store.start('draft', operation);
  store.deliver(operation, { type: 'picked' }); store.deliver(operation, { type: 'prepared', file: fixture().file });
  store.deliver(operation, { type: 'workerReady' }); store.deliver(operation, { type: 'extracted' });
  store.deliver(operation, { type: 'interpreted', result: fixture() }); store.initializeReview(store.captureReview()!);
  return { session, store };
}
test('catalog adapter uses only two fixed-Space GETs; local edits, staging, Continue and Back make no writes', async t => {
  const { store, session } = owned();
  const calls: { url: string; method: string }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method! });
    return Response.json(url.endsWith('/category-rules') ? { revision: '2', rules: [] } : catalog().categories);
  });
  const client = createCategoriesApiClient({ baseUrl: 'https://example.invalid', getAccessToken: async () => 'fictional' });
  await loadReviewCatalog(store, client, 'read');
  let state = store.snapshot(); assert.ok(state.phase === 'review');
  store.updateReview(store.captureReview()!, { type: 'editorChanged', editor: { ...state.review.editor!, values: { ...state.review.editor!.values, categoryId: 'food' }, remember: true } });
  store.updateReview(store.captureReview()!, { type: 'saved', now, localId: 'local' });
  store.updateReview(store.captureReview()!, { type: 'continued', now });
  assert.equal(store.snapshot().phase, 'review-ready');
  store.backToReview(store.captureReview()!);
  store.updateReview(store.captureReview()!, { type: 'filterChanged', filter: 'excluded' });
  state = store.snapshot(); assert.ok(state.phase === 'review');
  session.changeSpace('personal', false);
  for (const event of [{ type: 'continued', now }, { type: 'excluded', sourceRowId: '0' }, { type: 'restored', sourceRowId: '0' }, { type: 'saved', now, localId: 'blocked' }] as const) {
    assert.equal(store.updateReview(store.captureReview()!, event), false);
  }
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.method === 'GET' && call.url.includes('/spaces/personal/')));
});

test('catalog requires both reads, rejects malformed links, ignores replaced generations and recovers after failure', async () => {
  const { store, session } = owned();
  let finish!: (value: SpaceCategory[]) => void;
  const old = loadReviewCatalog(store, { listCategories: () => new Promise(resolve => { finish = resolve; }), getCategoryRules: async () => ({ revision: '2', rules: [] }) }, 'old');
  session.observeIdentity('ada', 'replacement');
  await loadReviewCatalog(store, { listCategories: async () => catalog().categories.slice(), getCategoryRules: async () => ({ revision: '2', rules: [{ pattern: 'x', matchType: 'exact' }] }) }, 'broken');
  let state = store.snapshot(); assert.ok(state.phase === 'review'); assert.equal(state.review.catalog.status, 'failed');
  assert.throws(() => reviewCatalog('personal', [], { revision: '0', rules: [{ id: '1', pattern: 'x', matchType: 'exact' }] }));
  await loadReviewCatalog(store, { listCategories: async () => catalog().categories.slice(), getCategoryRules: async () => ({ revision: '2', rules: [] }) }, 'retry');
  finish(catalog().categories.slice()); await old;
  state = store.snapshot(); assert.ok(state.phase === 'review'); assert.equal(state.review.catalog.status, 'ready');
  assert.ok(state.review.editor);
});

test('mixed ledger keeps PHP 1300 spending, locked exclusions and duplicate source identities through correction', () => {
  const original = fixture();
  const duplicate = { ...original.rows[0], sourceRowId: 'duplicate', sourceOrder: 6 };
  const evidence: ImportResult = { ...original, rows: [...original.rows, duplicate],
    controls: [{ kind: 'total-debits', originalValue: '1300.00', amountMinor: 130000n }],
    reconciliation: { outcome: 'mismatch', differenceMinor: 100000n } };
  const before = structuredClone(evidence);
  let state = initializeReview(evidence);
  const request = { owner: evidence.owner, draftId: evidence.draftId, generation: 1, id: 'mixed' };
  state = reduce(reduce(state, { type: 'catalogRequested', request }), { type: 'catalogSucceeded', request, catalog: catalog() });
  state = reduce(state, { type: 'excluded', sourceRowId: 'duplicate' });
  state = save(edit(state, { categoryId: 'food' }));
  state = save(edit(state, { categoryId: 'travel' }));
  const initial = validateReview(state, now).handoff;
  assert.ok(initial);
  assert.deepEqual(initial.rows.filter(row => row.inclusion === 'included').map(row => row.amount), ['1000.00', '300.00']);
  assert.equal(initial.rows.filter(row => row.inclusion !== 'included').length, 5);
  assert.deepEqual(initial.rows.slice(2, 6).map(row => row.inclusion), Array(4).fill('locked-excluded'));
  state = reduce(state, { type: 'rowOpened', sourceRowId: '0' });
  state = save(edit(state, { amount: '900.01', description: 'Fictional corrected purchase' }));
  const corrected = validateReview(state, now).handoff;
  assert.ok(corrected);
  assert.equal(corrected.rows[0].amount, '900.01');
  assert.equal(corrected.rows[1].amount, '300.00');
  assert.equal(corrected.rows[6].values.amount, '1000.00');
  assert.equal(corrected.rows[6].inclusion, 'user-excluded');
  assert.deepEqual(corrected.original, before);
  assert.deepEqual(evidence, before);
  state = reduce(state, { type: 'restored', sourceRowId: 'duplicate' });
  assert.equal(state.editor?.sourceRowId, 'duplicate');
  state = save(edit(state, { categoryId: 'food' }));
  assert.equal(validateReview(state, now).handoff?.rows[6].amount, '1000.00');
});
