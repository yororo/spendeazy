import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeletionWorkflow, type DeletionIntent } from './deletion-workflow.ts';
import { ExpenseApiError, ExpenseApiTransportError } from '../../api/request-failure.ts';
import { createSession } from '../../application/session.ts';
import type { DeletionStatus } from '../../api/account-deletion-api-client.ts';

const owner = { userId: 'fictional-owner', sessionId: 'fictional-session' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(marker: DeletionIntent | null = null) {
  let stored = marker;
  const session = createSession(); session.observeIdentity(owner.userId, owner.sessionId); session.changeSpace('personal');
  const calls: string[] = [];
  const deps = {
    read: async () => stored,
    write: async (intent: DeletionIntent | null) => { calls.push('write'); stored = intent; },
    gate: session.blockIdentity,
    cleanup: async () => { calls.push('cleanup'); await session.acceptedAccountDeletion(); },
    client: () => ({ submit: async (): Promise<DeletionStatus> => { calls.push('submit'); return 'pending'; }, check: async (): Promise<DeletionStatus> => 'pending' }),
  };
  const workflow = createDeletionWorkflow(deps);
  workflow.observe(owner);
  return { workflow, session, deps, calls, stored: () => stored };
}

test('writes intent before send, accepts delayed 202 across Space change, and fences unchanged Clerk identity', async () => {
  const f = fixture(); const response = deferred<DeletionStatus>();
  f.deps.client = () => ({ submit: () => { f.calls.push('submit'); return response.promise; }, check: async () => 'pending' });
  await f.workflow.initialize();
  const request = f.workflow.submit();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls, ['write', 'submit']);
  assert.equal(f.stored()?.phase, 'submitted');
  f.session.changeSpace('shared');
  response.resolve('pending'); await request;
  assert.equal(f.workflow.snapshot().phase, 'pending');
  assert.equal(f.stored()?.phase, 'accepted');
  f.session.observeIdentity(owner.userId, owner.sessionId);
  assert.equal(f.session.snapshot().userId, null);
  assert.equal(f.session.isCurrent(f.session.capture()), false);
});

test('storage failure never submits and leaves financial access available', async () => {
  const f = fixture(); f.deps.write = async () => { throw new Error('storage'); };
  await f.workflow.initialize(); await f.workflow.submit();
  assert.equal(f.workflow.snapshot().phase, 'ready');
  assert.match(f.workflow.snapshot().error!, /No deletion request was sent/);
  assert.equal(f.session.isCurrent(f.session.capture()), true);
  assert.equal(f.calls.includes('submit'), false);
});

test('response loss, restart, 404 before acceptance and repeated DELETE never imply completion', async () => {
  const f = fixture(); f.deps.client = () => ({ submit: async () => { throw new ExpenseApiTransportError(); }, check: async () => 'pending' });
  await f.workflow.initialize(); await f.workflow.submit();
  assert.equal(f.workflow.snapshot().phase, 'uncertain');
  const restarted = fixture(f.stored());
  restarted.deps.client = () => ({ submit: async () => 'pending', check: async () => { throw new ExpenseApiError(404, 'USER_NOT_FOUND', 'Not yet accepted'); } });
  await restarted.workflow.initialize(); await restarted.workflow.check();
  assert.equal(restarted.workflow.snapshot().phase, 'uncertain');
  assert.equal(restarted.session.isCurrent(restarted.session.capture()), false);
  await restarted.workflow.submit();
  assert.equal(restarted.workflow.snapshot().phase, 'pending');
  await restarted.workflow.submit();
  assert.equal(restarted.workflow.snapshot().phase, 'pending');
});

test('status 401 and sign-out preserve acceptance without claiming completion', async () => {
  const f = fixture({ ...owner, phase: 'accepted' });
  f.deps.client = () => ({ submit: async () => 'pending', check: async () => { throw new ExpenseApiError(401, 'UNAUTHORIZED', 'Revoked'); } });
  await f.workflow.initialize(); await f.workflow.check();
  assert.equal(f.workflow.snapshot().phase, 'ended');
  assert.equal(f.workflow.snapshot().accepted, true);
  f.workflow.observe(null);
  assert.equal(f.workflow.snapshot().phase, 'ended');
  await f.workflow.forget();
  assert.equal(f.stored(), null);
});

test('another session of the deleting user cannot use the initiating-session status capability', async () => {
  const f = fixture({ ...owner, phase: 'accepted' }); await f.workflow.initialize();
  f.workflow.observe({ ...owner, sessionId: 'another-session' });
  assert.equal(f.workflow.snapshot().phase, 'ended');
  await f.workflow.check();
  assert.equal(f.workflow.snapshot().phase, 'ended');
});

test('late completion cannot bind deletion to a new identity; a new identity can provision', async () => {
  const f = fixture(); const response = deferred<DeletionStatus>();
  f.deps.client = () => ({ submit: () => response.promise, check: async () => 'pending' });
  await f.workflow.initialize(); const pending = f.workflow.submit();
  await new Promise(resolve => setImmediate(resolve));
  f.workflow.observe({ userId: 'new-owner', sessionId: 'new-session' });
  f.session.observeIdentity('new-owner', 'new-session');
  response.resolve('completed'); await pending;
  assert.equal(f.workflow.snapshot().phase, 'ready');
  assert.equal(f.session.snapshot().userId, 'new-owner');
  assert.equal(f.stored()?.phase, 'submitted');
});

test('completed requires explicit proof; private cleanup failures remain gated and retryable', async () => {
  let fails = true;
  const session = createSession(undefined, undefined, undefined, async () => { if (fails) throw new Error('device'); });
  session.observeIdentity(owner.userId, owner.sessionId);
  const f = fixture();
  f.deps.gate = session.blockIdentity;
  f.deps.cleanup = session.acceptedAccountDeletion;
  f.deps.client = () => ({ submit: async () => 'completed', check: async () => 'completed' });
  await f.workflow.initialize(); await f.workflow.submit();
  assert.equal(f.workflow.snapshot().accepted, true);
  assert.equal(f.workflow.snapshot().phase, 'completed');
  assert.equal(session.snapshot().cleanupError, true);
  session.observeIdentity(owner.userId, owner.sessionId);
  assert.equal(session.snapshot().userId, null);
  fails = false; await session.retryCleanup();
  assert.equal(session.snapshot().cleanupError, false);
});

test('an unreadable intent blocks initialization until a successful retry', async () => {
  const f = fixture(); const read = f.deps.read;
  f.deps.read = async () => { throw new Error('unreadable'); };
  await f.workflow.initialize(); await f.workflow.submit();
  assert.equal(f.workflow.snapshot().phase, 'storage-error');
  assert.equal(f.calls.includes('submit'), false);
  f.deps.read = read; await f.workflow.initialize();
  assert.equal(f.workflow.snapshot().phase, 'ready');
});
