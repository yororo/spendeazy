import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from './session.ts';
import { sessionRequest } from './session-request.ts';
import { ExpenseApiError, ExpenseApiTransportError, InvalidApiResponseError, requestFailure } from '../api/request-failure.ts';

test('all authenticated workflows share one expiry recovery even when failures overlap', async () => {
  const session = createSession();
  session.observeIdentity('ada');
  let recovery = 0;
  const run = sessionRequest(session, session.capture(), async () => { recovery += 1; });
  await Promise.allSettled([run(async () => { throw new ExpenseApiError(401, 'UNAUTHORIZED', 'Expired'); }), run(async () => { throw new ExpenseApiError(401, 'UNAUTHORIZED', 'Expired'); })]);
  assert.equal(recovery, 1);
  assert.equal(session.snapshot().notice, 'expired');
});

test('obsolete successes and failures are rejected without expiring the new session', async () => {
  for (const fails of [false, true]) {
    const session = createSession();
    session.observeIdentity('ada');
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    const run = sessionRequest(session, session.capture(), async () => { assert.fail('obsolete failure started recovery'); });
    const result = run(async () => { await pending; if (fails) throw new ExpenseApiError(401, 'UNAUTHORIZED', 'Expired'); return 'private'; });
    session.observeIdentity('grace');
    complete();
    await assert.rejects(result, (cause) => requestFailure(cause) === 'obsolete');
    assert.equal(session.snapshot().notice, null);
  }
});

test('missing credentials, transport failures and invalid responses do not expire a session', async () => {
  const session = createSession();
  session.observeIdentity('ada');
  const run = sessionRequest(session, session.capture(), async () => { assert.fail('unexpected recovery'); });
  for (const [cause, kind] of [[new ExpenseApiError(401, 'MISSING_ACCESS_TOKEN', 'Missing'), 'missing-credentials'], [new ExpenseApiTransportError(), 'transport'], [new InvalidApiResponseError(), 'invalid-response']] as const) {
    await assert.rejects(run(async () => { throw cause; }), (error) => requestFailure(error) === kind);
    assert.equal(session.snapshot().notice, null);
  }
});

test('live credential changes reject a failure before the React identity observer catches up', async () => {
  const session = createSession(); session.observeIdentity('ada');
  let credentialsCurrent = true;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const run = sessionRequest(session, session.capture(), async () => { assert.fail('new session signed out'); }, () => credentialsCurrent);
  const result = run(async () => { await pending; throw new ExpenseApiError(401, 'UNAUTHORIZED', 'expired'); });
  credentialsCurrent = false;
  finish();
  await assert.rejects(result, (cause) => requestFailure(cause) === 'obsolete');
  assert.equal(session.snapshot().notice, null);
});

test('authoritative deletion signals clear private work and cannot be restored by unchanged Clerk observation', async () => {
  for (const code of ['ACCOUNT_DELETION_PENDING', 'ACCOUNT_DELETED']) {
    const session = createSession(); session.observeIdentity('ada', 'session');
    session.saveDraft({ amount: '12', description: 'Lunch', categoryId: 'food', expenseDate: '2026-10-24' });
    const run = sessionRequest(session, session.capture(), async () => { assert.fail('ordinary expiry recovery'); });
    await assert.rejects(run(async () => { throw new ExpenseApiError(403, code, 'Deleted'); }));
    session.observeIdentity('ada', 'session');
    assert.equal(session.snapshot().userId, null);
    assert.equal(session.snapshot().draft, null);
    session.observeIdentity('new-owner', 'new-session');
    assert.equal(session.snapshot().userId, 'new-owner');
  }
});
