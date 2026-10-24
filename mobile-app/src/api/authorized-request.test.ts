import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizedRequest } from './authorized-request.ts';
import { requestFailure } from './request-failure.ts';
import { createSession } from '../application/session.ts';
import { sessionRequest } from '../application/session-request.ts';

test('HTTP boundary distinguishes credentials, expiry, transport and invalid JSON', async (t) => {
  const options = { baseUrl: 'https://example.invalid', getAccessToken: async () => 'token' };
  await assert.rejects(authorizedRequest({ ...options, getAccessToken: async () => null }, '/spaces'), (cause) => requestFailure(cause) === 'missing-credentials');
  for (const [response, expected] of [
    [new Response('denied', { status: 401 }), 'expired'],
    [new Response('broken', { status: 200 }), 'invalid-response'],
    [new Response('', { status: 200 }), 'invalid-response'],
  ] as const) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(authorizedRequest(options, '/spaces'), (cause) => requestFailure(cause) === expected);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
  await assert.rejects(authorizedRequest(options, '/spaces'), (cause) => requestFailure(cause) === 'transport');
});

test('an HTTP failure received after switching Spaces cannot expire the session', async (t) => {
  const session = createSession();
  session.observeIdentity('ada');
  session.changeSpace('personal');
  let respond!: (value: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { respond = resolve; }));
  const result = authorizedRequest({
    baseUrl: 'https://example.invalid', getAccessToken: async () => 'token',
    execute: sessionRequest(session, session.capture(), async () => { assert.fail('unexpected sign-out'); }),
  }, '/expenses');
  await new Promise((resolve) => setImmediate(resolve));
  session.changeSpace('shared');
  respond(new Response('{}', { status: 401 }));
  await assert.rejects(result, (cause) => requestFailure(cause) === 'obsolete');
  assert.equal(session.snapshot().notice, null);
});
