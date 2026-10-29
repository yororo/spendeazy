import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from '../../application/session.ts';
import type { ImportResult } from './import-model.ts';
import type { ImportOperation, ImportOutcome } from './import-state.ts';
import { importReducer } from './import-state.ts';
import type { ReviewEditor, ReviewHandoff } from './review-model.ts';

function setup() {
  const session = createSession();
  session.observeIdentity('ada', 'first');
  session.changeSpace('personal');
  const operation = (id: string): ImportOperation => ({
    id, generation: session.capture().generation, owner: { userId: 'ada', spaceId: 'personal' },
  });
  return { session, store: session.imports, operation };
}
const file = { name: 'fictional.pdf', byteCount: 123, sha256: 'a'.repeat(64) };
function result(): ImportResult {
  return {
    draftId: 'draft', owner: { userId: 'ada', spaceId: 'personal' }, file,
    account: { provider: 'gcash', format: 'e-wallet', statementType: 'e-wallet' },
    dates: { statementDate: null, historyPeriod: { from: '2026-01-01', to: '2026-01-31' } },
    controls: [], rows: [{
      sourceRowId: '0:0', pageIndex: 0, sourceOrder: 0, description: 'Fictional purchase',
      originalDate: '2026-01-02', date: '2026-01-02', reference: null, originalAmount: '1000.00',
      signedActivityMinor: 100000n, evidence: [{ kind: 'debit-credit-column', value: 'debit' }],
      classification: { eligible: true, kind: 'purchase', expenseMinor: 100000n },
    }],
    pages: [{ pageIndex: 0, outcome: 'text', hasImages: false }],
    completeness: { assessment: 'uncertain', failedPageIndices: [], unreadablePageIndices: [] },
    recognitionEvidence: [{ kind: 'provider', value: 'GCash' }],
    reconciliation: { outcome: 'unavailable', differenceMinor: null }, warnings: [],
  };
}
function extract(store: ReturnType<typeof setup>['store'], op: ImportOperation) {
  store.deliver(op, { type: 'picked' });
  store.deliver(op, { type: 'prepared', file });
  store.deliver(op, { type: 'workerReady' });
}

test('all async outcomes and cancellation from a replaced operation are ignored', () => {
  const { store, operation } = setup();
  const first = operation('first');
  store.start('draft', first);
  let cleared = 0;
  store.onInvalidate(first, () => { assert.equal(store.snapshot().phase, 'idle'); cleared++; });
  store.cancel(first);
  const next = operation('next');
  assert.equal(store.start('replacement', next), true);
  const before = store.snapshot();
  const outcomes: ImportOutcome[] = [
    { type: 'picked' }, { type: 'prepared', file }, { type: 'workerReady' },
    { type: 'progress', completedPages: 1, totalPages: 2 }, { type: 'passwordRequired', reason: 'required' },
    { type: 'passwordSubmitted' }, { type: 'extracted' }, { type: 'interpreted', result: result() },
    { type: 'failed', error: 'picker-failed' }, { type: 'failed', error: 'prepare-failed' },
  ];
  for (const outcome of outcomes) store.deliver(first, outcome);
  store.cancel(first);
  store.deliver({ ...next, owner: { userId: 'bea', spaceId: 'personal' } }, { type: 'picked' });
  store.deliver({ ...next, owner: { userId: 'ada', spaceId: 'shared' } }, { type: 'picked' });
  assert.equal(store.snapshot(), before);
  assert.equal(cleared, 1);
});

test('worker readiness waits for preparation; password/progress and result ownership obey phases', () => {
  const { store, operation } = setup();
  const op = operation('first');
  store.start('draft', op);
  store.deliver(op, { type: 'workerReady' });
  assert.equal(store.snapshot().phase, 'picking');
  extract(store, op);
  store.deliver(op, { type: 'passwordRequired', reason: 'required' });
  store.deliver(op, { type: 'passwordSubmitted' });
  store.deliver(op, { type: 'passwordRequired', reason: 'incorrect' });
  assert.equal(store.snapshot().phase, 'password-required');
  store.deliver(op, { type: 'passwordSubmitted' });
  store.deliver(op, { type: 'progress', completedPages: 1, totalPages: 2 });
  const progress = store.snapshot();
  store.deliver(op, { type: 'progress', completedPages: -1, totalPages: 2 });
  assert.equal(store.snapshot(), progress);
  store.deliver(op, { type: 'extracted' });
  store.deliver(op, { type: 'interpreted', result: { ...result(), owner: { userId: 'ada', spaceId: 'shared' } } });
  store.deliver(op, { type: 'interpreted', result: { ...result(), draftId: 'wrong' } });
  store.deliver(op, { type: 'interpreted', result: { ...result(), rows: [] } });
  assert.equal(store.snapshot().phase, 'interpreting');
  let cleared = false;
  store.onInvalidate(op, () => { cleared = true; });
  store.deliver(op, { type: 'interpreted', result: result() });
  assert.equal(store.snapshot().phase, 'ready');
  assert.equal(cleared, true);
  store.deliver(op, { type: 'failed', error: 'unreadable' });
  assert.equal(store.snapshot().phase, 'ready');
});

test('expiry clears adapter references; same identity needs reselection for interrupted work', () => {
  const { session, store, operation } = setup();
  const old = operation('first');
  store.start('draft', old);
  extract(store, old);
  let cleared = 0;
  store.onInvalidate(old, () => { assert.equal(store.snapshot().phase, 'suspended'); cleared++; });
  session.expire(session.capture());
  store.deliver(old, { type: 'extracted' });
  assert.equal(store.snapshot().phase, 'suspended');
  session.observeIdentity(null);
  session.observeIdentity('ada', 'replacement');
  assert.deepEqual(store.snapshot(), { phase: 'suspended', draftId: 'draft', owner: old.owner, reason: 'reselection-required', result: null });
  assert.equal(session.snapshot().announceRecovery, true);
  assert.equal(store.start('draft', old), false);
  assert.equal(store.start('draft', operation('new')), true);
  assert.equal(cleared, 1);
});

test('completed evidence survives same User recovery and archive, while archives block new work', () => {
  const { session, store, operation } = setup();
  const op = operation('first');
  store.start('draft', op); extract(store, op);
  store.deliver(op, { type: 'extracted' });
  const evidence = result();
  store.deliver(op, { type: 'interpreted', result: evidence });
  session.expire(session.capture());
  session.observeIdentity('ada', 'replacement');
  const ready = store.snapshot();
  assert.equal(ready.phase === 'ready' && ready.result, evidence);
  session.changeSpace('personal', false);
  assert.equal(store.snapshot(), ready);
  store.discard();
  assert.equal(store.start('new', operation('new')), false);
});

test('archive during extraction clears references and fences delivery after access returns', () => {
  const { session, store, operation } = setup();
  const old = operation('first');
  store.start('draft', old); extract(store, old);
  let cleared = 0;
  store.onInvalidate(old, () => { cleared++; });
  session.changeSpace('personal', false);
  store.deliver(old, { type: 'extracted' });
  assert.equal(store.snapshot().phase, 'suspended');
  session.changeSpace('personal', true);
  store.deliver(old, { type: 'failed', error: 'unreadable' });
  assert.equal(store.snapshot().phase, 'suspended');
  assert.equal(cleared, 1);
});

for (const transition of ['sign-out', 'different-identity'] as const) {
  test(`${transition} clears import state and prevents cross-identity delivery`, () => {
    const { session, store, operation } = setup();
    const old = operation('first');
    store.start('draft', old);
    let cleared = false;
    store.onInvalidate(old, () => { cleared = true; });
    if (transition === 'sign-out') session.signOut();
    else session.observeIdentity('bea', 'second');
    store.deliver(old, { type: 'failed', error: 'prepare-failed' });
    assert.deepEqual(store.snapshot(), { phase: 'idle' });
    assert.equal(cleared, true);
  });
}

test('replacement credentials invalidate active extraction even without an explicit expiry event', () => {
  const { session, store, operation } = setup();
  const old = operation('first'); store.start('draft', old);
  session.observeIdentity('ada', 'replacement');
  store.deliver(old, { type: 'picked' });
  assert.equal(store.snapshot().phase, 'suspended');
});

function reviewed() {
  const context = setup();
  const op = context.operation('extract');
  context.store.start('draft', op); extract(context.store, op);
  context.store.deliver(op, { type: 'extracted' });
  const original = result();
  const before = structuredClone(original);
  context.store.deliver(op, { type: 'interpreted', result: original });
  const scope = context.store.captureReview()!;
  assert.equal(context.store.initializeReview(scope), true);
  const editor: ReviewEditor = { sourceRowId: '0:0', values: { amount: 'invalid temporary amount',
    description: 'Tentative correction', expenseDate: '', categoryId: null }, remember: true, matchType: 'contains', pattern: 'Fictional' };
  context.store.updateReview(scope, { type: 'editorChanged', editor });
  return { ...context, original, before, scope, editor };
}

test('initialize once and route resubscription retain tentative work independently of original evidence', () => {
  const { store, scope, original, before, editor } = reviewed();
  const state = store.snapshot();
  const unsubscribe = store.subscribe(() => {}); unsubscribe();
  const remount = store.subscribe(() => {});
  store.initializeReview(scope); store.backToReview(scope);
  assert.equal(store.snapshot(), state);
  assert.ok(state.phase === 'review');
  assert.equal(state.review.original, original);
  assert.equal(state.review.editor, editor);
  assert.equal(state.review.rows['0:0'].values.amount, '1000.00');
  assert.equal(state.review.rows['0:0'].values.description, 'Fictional purchase');
  assert.deepEqual(original, before);
  remount();
});

test('review and invalid editor survive same User suspension/recovery, with old commands fenced', () => {
  const { store, session, scope } = reviewed();
  const state = store.snapshot(); assert.ok(state.phase === 'review');
  session.expire(session.capture());
  assert.equal(store.updateReview(scope, { type: 'editorChanged', editor: null }), false);
  assert.equal(store.captureReview(), null);
  session.observeIdentity(null); session.observeIdentity('ada', 'replacement');
  const resumed = store.snapshot(); assert.ok(resumed.phase === 'review');
  assert.equal(resumed.review, state.review);
  assert.equal(store.updateReview(scope, { type: 'editorChanged', editor: null }), false);
  assert.equal(store.updateReview(store.captureReview()!, { type: 'editorChanged', editor: null }), true);
});

test('catalog request generation, draft, destination and request identities fence stale deliveries and retries', () => {
  const { store, scope, session, editor } = reviewed();
  const first = { ...scope, id: 'first' }; const next = { ...scope, id: 'next' };
  const catalog = { spaceId: 'personal', categories: [], rules: [], rulesRevision: '0' };
  store.updateReview(scope, { type: 'catalogRequested', request: first });
  store.updateReview(scope, { type: 'catalogRequested', request: next });
  const pending = store.snapshot();
  for (const request of [first, { ...next, draftId: 'other' }, { ...next, generation: -1 },
    { ...next, owner: { ...scope.owner, spaceId: 'shared' } }]) {
    assert.equal(store.updateReview(scope, { type: 'catalogSucceeded', request, catalog }), false);
  }
  assert.equal(store.snapshot(), pending);
  store.updateReview(scope, { type: 'catalogFailed', request: next });
  store.updateReview(scope, { type: 'catalogRequested', request: { ...scope, id: 'retry' } });
  store.updateReview(scope, { type: 'catalogSucceeded', request: { ...scope, id: 'retry' }, catalog });
  let state = store.snapshot(); assert.ok(state.phase === 'review');
  assert.equal(state.review.editor, editor); assert.equal(state.review.catalog.snapshot, catalog);
  session.observeIdentity('ada', 'replacement');
  assert.equal(store.updateReview(scope, { type: 'catalogSucceeded', request: next, catalog }), false);
  state = store.snapshot(); assert.ok(state.phase === 'review'); assert.equal(state.review.editor, editor);
});

test('archived review stays inspectable and filterable while edits and extraction are blocked', () => {
  const { store, session, scope, editor } = reviewed();
  session.changeSpace('personal', false);
  assert.equal(store.initializeReview(scope), true);
  assert.equal(store.updateReview(scope, { type: 'editorChanged', editor: null }), false);
  assert.equal(store.updateReview(scope, { type: 'filterChanged', filter: 'excluded' }), true);
  const state = store.snapshot(); assert.ok(state.phase === 'review');
  assert.equal(state.review.editor, editor);
  session.expire(session.capture()); session.observeIdentity('ada', 'replacement');
  assert.equal(store.snapshot().phase, 'review');
  assert.equal(session.changeSpace('shared'), false);
});

for (const clear of ['discard', 'sign-out', 'different-identity'] as const) {
  test(`${clear} removes the entire review and rejects commands from its previous draft`, () => {
    const { store, session, scope } = reviewed();
    if (clear === 'discard') store.discard();
    else if (clear === 'sign-out') session.signOut();
    else session.observeIdentity('bea', 'second');
    assert.deepEqual(store.snapshot(), { phase: 'idle' });
    assert.equal(store.initializeReview(scope), false);
    assert.equal(store.updateReview(scope, { type: 'editorChanged', editor: null }), false);
    assert.equal(session.changeSpace('shared'), true);
  });
}

test('review commands reject mismatched ownership and locked source classifications', () => {
  const { store, scope, editor } = reviewed();
  for (const command of [{ ...scope, draftId: 'other' }, { ...scope, owner: { userId: 'bea', spaceId: 'personal' } },
    { ...scope, owner: { userId: 'ada', spaceId: 'shared' } }]) {
    assert.equal(store.initializeReview(command), false);
    assert.equal(store.updateReview(command, { type: 'editorChanged', editor: null }), false);
  }
  const original = result();
  const locked = { ...original, rows: [{ ...original.rows[0], classification: { eligible: false as const, reason: 'unknown-direction' as const } }] };
  const state = importReducer({ phase: 'ready', draftId: 'draft', owner: scope.owner, result: locked }, { type: 'reviewInitialized' });
  assert.ok(state.phase === 'review');
  assert.equal(state.review.rows['0:0'].inclusion, 'locked-excluded');
  assert.equal(importReducer(state, { type: 'reviewChanged', event: { type: 'editorChanged', editor } }), state);
});

test('confirmation-boundary recovery and Back retain applied values, staged intents and both editor buffers', () => {
  const { store, editor } = reviewed();
  const state = store.snapshot(); assert.ok(state.phase === 'review');
  const stagedRules = [{ localId: 'local-rule', pattern: 'fictional', normalizedPattern: 'fictional',
    matchType: 'exact' as const, categoryId: 'food', categoryRevision: '2', rulesRevision: '3', existingRuleId: null }];
  // A hypothetical validated boundary supplied by task 5; task 1 intentionally exposes no Continue command.
  const catalog = { spaceId: 'personal', categories: [], rules: [], rulesRevision: '3' };
  const handoff: ReviewHandoff = { owner: state.owner, draftId: state.draftId, reviewRevision: 4,
    original: state.result, rows: [], stagedRules, catalog };
  const review = { ...state.review, revision: 4, stagedRules, handoff, pendingQueueEditor: editor,
    queueSourceRowId: '0:0', deferredSourceRowIds: ['0:0'], ledgerFilter: 'unmapped' as const };
  const boundary = { ...state, phase: 'review-ready' as const, review };
  const suspended = importReducer(boundary, { type: 'suspended', reason: 'authentication' });
  const recovered = importReducer(suspended, { type: 'recovered' });
  assert.ok(recovered.phase === 'review-ready');
  assert.equal(recovered.review.handoff, handoff);
  assert.deepEqual(recovered.review, review);
  const back = importReducer(recovered, { type: 'reviewReopened' });
  assert.ok(back.phase === 'review'); assert.equal(back.review, recovered.review);
  const changed = importReducer(back, { type: 'reviewChanged', event: { type: 'editorChanged', editor: null } });
  assert.ok(changed.phase === 'review');
  assert.equal(changed.review.handoff, null);
  assert.equal(changed.review.stagedRules, stagedRules);
  assert.equal(changed.review.revision, 4); // Tentative text does not apply a review revision.
  assert.deepEqual(importReducer(boundary, { type: 'discarded' }), { phase: 'idle' });
});
