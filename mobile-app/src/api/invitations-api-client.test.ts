import assert from 'node:assert/strict';
import test from 'node:test';

import { createInvitationsApiClient } from './invitations-api-client.ts';
import { requestFailure } from './request-failure.ts';

const options = { baseUrl: 'https://example.invalid', getAccessToken: async () => 'token' };
const code = '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3';
const outgoing = { id: '42', code, status: 'pending', expiresAt: '2026-11-02T00:00:00.000Z', createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
const incoming = { id: '88', senderName: 'Ada', status: 'pending', expiresAt: '2026-11-02T00:00:00.000Z', createdAt: '2026-10-26T00:00:00.000Z' };

test('invitation adapter decodes the inbox, saves a preview, and accepts only on explicit request', async (t) => {
  const client = createInvitationsApiClient(options);
  const seen: { url: string; method: string; body: string | null }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
    if (String(url).endsWith('/invitations')) return Response.json({ outgoing, incoming: [] });
    if (String(url).endsWith('/invitations/claims')) return Response.json(incoming, { status: 201 });
    if (String(url).endsWith('/88/accept')) return Response.json({
      id: '77', kind: 'shared', status: 'active', accessLevel: 'write',
      members: [{ id: '1', name: 'Grace' }, { id: '2', name: 'Ada' }],
    });
    throw new Error(`Unexpected request: ${String(url)}`);
  });

  assert.deepEqual(await client.list(), { outgoing, incoming: [] });
  assert.deepEqual(await client.claim(code), incoming);
  const joined = await client.accept(incoming.id);
  assert.equal(joined.id, '77');
  assert.equal(seen[1]?.method, 'POST');
  assert.deepEqual(JSON.parse(seen[1]?.body ?? 'null'), { code });
  assert.equal(seen[2]?.url.endsWith('/claims/88/accept'), true);
});

test('invitation adapter accepts no-content revoke and decline responses', async (t) => {
  const client = createInvitationsApiClient(options);
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  await client.revoke();
  await client.decline('88');
});

test('malformed invitation responses are rejected at the adapter boundary', async (t) => {
  const client = createInvitationsApiClient(options);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ outgoing: null, incoming: [{ ...incoming, id: '0' }] }));
  await assert.rejects(client.list(), (cause) => requestFailure(cause) === 'invalid-response');
});
