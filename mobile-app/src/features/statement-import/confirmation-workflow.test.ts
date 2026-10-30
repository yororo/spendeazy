import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmationHandoff } from './confirmation.fixture.ts';
import { createConfirmationWorkflow, confirmationSummary } from './confirmation-workflow.ts';
import { ExpenseApiError, ExpenseApiTransportError } from '../../api/request-failure.ts';
import type { ImportConfirmationApi, ImportPreview } from '../../api/statement-import-confirmation-api-client.ts';
import { createReceiptOwner, type ReceiptOwner } from './confirmation-receipt.ts';

const id = '11111111-1111-4111-8111-111111111111';
const preview: ImportPreview = { warnings: [], warningDigest: 'a'.repeat(64) };
const result = { status: 'committed' as const, operationId: id, statementImportId: '12', confirmedAt: '2026-10-30T00:00:00.000Z', originalExpenseCount: '2', originalExpenseTotal: '1300.00' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function setup(receipts?: ReceiptOwner) {
  let h: ReturnType<typeof confirmationHandoff> | null = confirmationHandoff();
  const access = { ...h.owner, ownerUserId: h.owner.userId, generation: 1, authenticated: true, writable: true };
  let locked = false; let complete = 0; let refresh = 0;
  const workflow = createConfirmationWorkflow({ receipts, access: () => access, handoff: () => h, lock: value => { locked = value; }, complete: () => { complete++; }, refresh: () => { refresh++; } });
  const calls: { id: string; json: string }[] = [];
  const api: ImportConfirmationApi = { status: async () => result, preview: async () => preview, confirm: async (_, id, json) => { calls.push({ id, json }); return result; } };
  return { workflow, access, api, calls, handoff: () => h!, replace: () => { h = { ...h!, reviewRevision: h!.reviewRevision + 1 }; workflow.synchronize(); }, back: () => { h = null; workflow.synchronize(); }, locked: () => locked, counts: () => [complete, refresh] };
}
test('summary totals use included edited centavos independently of original controls', () => {
  const summary = confirmationSummary(confirmationHandoff());
  assert.equal(summary.total, 130000n); assert.equal(summary.found, 10); assert.equal(summary.included, 2); assert.equal(summary.excluded, 8);
  assert.equal(summary.categories.reduce((sum, c) => sum + c.total, 0n), 130000n);
});
test('stale preview after edits, Back or session change cannot authorize submission', async () => {
  for (const change of ['edit', 'back', 'session'] as const) {
    const s = setup(); const pending = deferred<ImportPreview>(); s.api.preview = () => pending.promise;
    const loading = s.workflow.preview(s.api);
    if (change === 'edit') s.replace(); else if (change === 'back') s.back(); else { s.access.generation++; s.workflow.synchronize(); }
    pending.resolve(preview); await loading;
    assert.equal(s.workflow.snapshot().preview, null);
    await s.workflow.submit(s.api, () => id, async () => {}); assert.equal(s.calls.length, 0);
  }
});
test('missing or failed receipt prevents every PUT; receipt contains identity only', async () => {
  const s = setup(); await s.workflow.preview(s.api);
  await s.workflow.submit(s.api, () => id); assert.equal(s.calls.length, 0);
  await s.workflow.submit(s.api, () => id, async receipt => { assert.deepEqual(Object.keys(receipt).sort(), ['operationId', 'spaceId', 'userId']); throw Error(); });
  assert.equal(s.calls.length, 0); assert.equal(s.locked(), false); assert.equal(s.workflow.snapshot().phase, 'failed');
});
test('repeated taps send once, receipt precedes PUT, and completion refreshes once', async () => {
  const s = setup(); const receipt = deferred<void>(); await s.workflow.preview(s.api);
  const sending = s.workflow.submit(s.api, () => id, () => receipt.promise);
  await s.workflow.submit(s.api, () => { throw Error('new ID'); }, async () => {});
  assert.equal(s.calls.length, 0); assert.equal(s.locked(), true);
  receipt.resolve(); await sending;
  await s.workflow.submit(s.api, () => id, async () => {});
  assert.equal(s.calls.length, 1); assert.deepEqual(s.counts(), [1, 1]); assert.equal(s.locked(), true);
  assert.equal(await s.workflow.acknowledge(), true); assert.equal(s.locked(), false);
});
test('response loss retains exact frozen JSON and UUID for live retry', async () => {
  const s = setup(); await s.workflow.preview(s.api);
  const confirm = s.api.confirm; let first = true;
  s.api.confirm = async (...args) => { await confirm(...args); if (first) { first = false; throw new ExpenseApiTransportError(); } return result; };
  await s.workflow.submit(s.api, () => id, async () => {});
  assert.equal(s.workflow.snapshot().phase, 'uncertain'); assert.equal(s.locked(), true);
  await s.workflow.preview(s.api); assert.equal(s.workflow.snapshot().phase, 'uncertain');
  await s.workflow.submit(s.api, () => { throw Error('must reuse ID'); }, async () => {});
  assert.deepEqual(s.calls[0], s.calls[1]); assert.deepEqual(s.counts(), [1, 1]);
});
test('refreshed warnings require explicit action and create a new UUID after rejection', async () => {
  const s = setup(); await s.workflow.preview(s.api);
  const refreshed: ImportPreview = { ...preview, warnings: [{ id: 'warn', type: 'exact_file', sourceRowIds: [], expenseIds: [], statementImportIds: ['9'], message: 'Previously imported.' }] };
  s.api.confirm = async () => { throw new ExpenseApiError(409, 'IMPORT_REVIEW_REQUIRED', 'Review again.', [], refreshed); };
  await s.workflow.submit(s.api, () => id, async () => {});
  assert.equal(s.workflow.snapshot().phase, 'uncertain');
  s.api.status = async () => ({ status: 'not_committed', operationId: id, failure: { code: 'IMPORT_REVIEW_REQUIRED', details: [], review: refreshed } });
  await s.workflow.checkStatus(s.api);
  assert.equal(s.workflow.snapshot().phase, 'not_committed'); assert.equal(s.locked(), true);
  await s.workflow.acknowledge();
  assert.equal(s.workflow.snapshot().phase, 'ready'); assert.equal(s.locked(), false);
  let sent = 0;
  s.api.confirm = async (_, operationId, json) => { sent++; assert.notEqual(operationId, id); const p = JSON.parse(json); assert.deepEqual(p.acknowledgedWarnings, ['warn']); assert.equal(p.acknowledgedWarningDigest, refreshed.warningDigest); return { ...result, operationId }; };
  await s.workflow.submit(s.api, () => 'new-id', async () => {}); assert.equal(sent, 0);
  await s.workflow.submit(s.api, () => 'new-id', async () => {}, true); assert.equal(sent, 1);
});
test('sent validation, Rule and envelope errors remain unresolved without authoritative status', async () => {
  for (const [status, code] of [[400, 'VALIDATION_FAILED'], [409, 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS'], [413, 'HTTP_ERROR']] as const) {
    const s = setup(); const original = s.handoff(); await s.workflow.preview(s.api);
    s.api.confirm = async () => { throw new ExpenseApiError(status, code, 'Correct review.'); };
    await s.workflow.submit(s.api, () => id, async () => {});
    assert.equal(s.handoff(), original); assert.equal(s.locked(), true); assert.equal(s.workflow.snapshot().phase, 'uncertain'); assert.deepEqual(s.counts(), [0, 0]);
    s.api.status = async () => { throw new ExpenseApiError(404, 'RESOURCE_NOT_FOUND', 'Unknown'); };
    await s.workflow.checkStatus(s.api);
    assert.equal(s.workflow.snapshot().phase, 'uncertain'); assert.equal(s.workflow.receipt()?.operationId, id);
  }
});
test('session replacement during receipt prevents send; stale save completion cannot clear work', async () => {
  const s = setup(); await s.workflow.preview(s.api); const pending = deferred<typeof result>(); s.api.confirm = () => pending.promise;
  const sending = s.workflow.submit(s.api, () => id, async () => {});
  await Promise.resolve(); s.access.generation++; s.workflow.synchronize(); pending.resolve(result); await sending;
  assert.deepEqual(s.counts(), [0, 0]); assert.equal(s.locked(), true); assert.equal(s.workflow.snapshot().phase, 'uncertain');
  const t = setup(); await t.workflow.preview(t.api);
  await t.workflow.submit(t.api, () => id, async () => { t.access.generation++; t.workflow.synchronize(); });
  assert.equal(t.calls.length, 0);
});
test('another owner never receives a late save result or failure', async () => {
  const s = setup(); await s.workflow.preview(s.api); const pending = deferred<typeof result>(); s.api.confirm = () => pending.promise;
  const sending = s.workflow.submit(s.api, () => id, async () => {}); await Promise.resolve();
  s.access.ownerUserId = 'another-user'; s.access.userId = 'another-user'; s.access.generation++; s.workflow.synchronize();
  pending.resolve(result); await sending;
  assert.equal(s.workflow.snapshot().phase, 'idle'); assert.equal(s.workflow.snapshot().result, null); assert.deepEqual(s.counts(), [0, 0]);
});

test('same-User renewal retries the frozen bytes and warnings with new request authority', async () => {
  const s = setup(); await s.workflow.preview(s.api);
  s.api.confirm = async (_, operationId, json) => { s.calls.push({ id: operationId, json }); throw new ExpenseApiTransportError(); };
  await s.workflow.submit(s.api, () => id, async () => {});
  s.access.authenticated = false; s.access.generation++; s.workflow.synchronize();
  await s.workflow.submit(s.api, () => { throw Error('new ID'); }, async () => {}); assert.equal(s.calls.length, 1);
  s.access.authenticated = true; s.access.generation++; s.workflow.synchronize();
  await s.workflow.submit(s.api, () => { throw Error('new ID'); }, async () => {});
  assert.equal(s.calls.length, 2); assert.deepEqual(s.calls[0], s.calls[1]);
});

test('restart checks original archived Space with no handoff, deduplicates GET and retries acknowledgment deletion', async () => {
  const h = confirmationHandoff(); const receipt = { ...h.owner, operationId: id };
  let disk: string | null = JSON.stringify(receipt); let failDelete = true;
  const owner = createReceiptOwner({ getItemAsync: async () => disk, setItemAsync: async () => { throw Error('restart must not PUT'); }, deleteItemAsync: async () => { if (failDelete) throw Error('device locked'); disk = null; } });
  const s = setup(owner); s.back(); s.access.writable = false;
  await s.workflow.hydrate(h.owner.userId); assert.equal(s.workflow.canRetry(), false);
  let gets = 0; const pending = deferred<typeof result>();
  s.api.status = async (spaceId, operationId) => { gets++; assert.equal(spaceId, receipt.spaceId); assert.equal(operationId, id); return pending.promise; };
  const checking = s.workflow.checkStatus(s.api); await s.workflow.checkStatus(s.api);
  await s.workflow.submit(s.api, () => id, owner.write); assert.equal(s.calls.length, 0);
  pending.resolve(result); await checking; await s.workflow.checkStatus(s.api);
  assert.equal(gets, 1); assert.deepEqual(s.counts(), [1, 1]);
  assert.equal(await s.workflow.acknowledge(), false); assert.equal(s.workflow.hasReceipt(), true); assert.equal(s.workflow.snapshot().phase, 'committed');
  failDelete = false; assert.equal(await s.workflow.acknowledge(), true); assert.equal(disk, null); assert.equal(s.workflow.hasReceipt(), false);
});

test('pending, 404, payload conflict and malformed/transport failures never resolve the original receipt', async () => {
  const s = setup(); await s.workflow.preview(s.api);
  s.api.confirm = async () => { throw new ExpenseApiError(409, 'IMPORT_OPERATION_PAYLOAD_CONFLICT', 'Conflict'); };
  await s.workflow.submit(s.api, () => id, async () => {});
  s.api.status = async () => ({ status: 'pending', operationId: id }); await s.workflow.checkStatus(s.api);
  assert.equal(s.workflow.snapshot().phase, 'uncertain');
  for (const error of [new ExpenseApiError(404, 'RESOURCE_NOT_FOUND', 'Unknown'), new Error('malformed'), new ExpenseApiTransportError()]) {
    s.api.status = async () => { throw error; }; await s.workflow.checkStatus(s.api);
    assert.equal(s.workflow.receipt()?.operationId, id); assert.equal(s.locked(), true); assert.equal(await s.workflow.acknowledge(), false);
  }
});

test('stale status after expiry cannot reveal success and a renewed status check works', async () => {
  const s = setup(); await s.workflow.preview(s.api); s.api.confirm = async () => { throw new ExpenseApiTransportError(); };
  await s.workflow.submit(s.api, () => id, async () => {});
  const pending = deferred<typeof result>(); s.api.status = () => pending.promise;
  const checking = s.workflow.checkStatus(s.api); s.access.authenticated = false; s.access.generation++; s.workflow.synchronize();
  pending.resolve(result); await checking; assert.equal(s.workflow.snapshot().result, null);
  s.access.authenticated = true; s.access.generation++; s.workflow.synchronize(); s.api.status = async () => result;
  await s.workflow.checkStatus(s.api); assert.equal(s.workflow.snapshot().phase, 'committed'); assert.deepEqual(s.counts(), [1, 1]);
});

test('an old PUT completion cannot reopen retry while renewed credentials are checking status', async () => {
  const s = setup(); await s.workflow.preview(s.api);
  const put = deferred<typeof result>(); s.api.confirm = () => put.promise;
  const sending = s.workflow.submit(s.api, () => id, async () => {}); await Promise.resolve();
  s.access.generation++; s.workflow.synchronize();
  const get = deferred<typeof result>(); s.api.status = () => get.promise;
  const checking = s.workflow.checkStatus(s.api);
  put.resolve(result); await sending;
  assert.equal(s.workflow.snapshot().phase, 'checking');
  get.resolve(result); await checking; assert.deepEqual(s.counts(), [1, 1]);
});

test('hydration completion from an older session cannot restore a receipt even for the same User', async () => {
  const h = confirmationHandoff(); const pending = deferred<string | null>();
  const owner = createReceiptOwner({ getItemAsync: () => pending.promise, setItemAsync: async () => {}, deleteItemAsync: async () => {} });
  const s = setup(owner); s.back();
  const hydrating = s.workflow.hydrate(h.owner.userId); await Promise.resolve();
  s.access.generation++; s.workflow.synchronize();
  pending.resolve(JSON.stringify({ ...h.owner, operationId: id })); await hydrating;
  assert.equal(s.workflow.hasReceipt(), false);
  await s.workflow.hydrate(h.owner.userId); assert.equal(s.workflow.receipt()?.operationId, id);
});
