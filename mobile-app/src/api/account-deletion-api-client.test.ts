import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountDeletionApiClient } from './account-deletion-api-client.ts';

test('deletion protocol requires exact acceptance metadata and explicit completion', async () => {
  const original = globalThis.fetch;
  const client = createAccountDeletionApiClient({ baseUrl: 'https://example.test', getAccessToken: async () => 'fictional' });
  try {
    for (const [http, payload, location, expected] of [
      [202, { status: 'pending' }, '/api/v1/users/me/deletion', 'pending'],
      [204, null, null, 'completed'],
      [200, { status: 'completed' }, null, null],
      [202, { status: 'completed' }, '/api/v1/users/me/deletion', null],
      [202, { status: 'pending' }, 'https://untrusted.test', null],
    ] as const) {
      globalThis.fetch = async () => new Response(http === 204 ? null : JSON.stringify(payload), { status: http, headers: location ? { Location: location } : {} });
      if (expected) assert.equal(await client.submit(), expected);
      else await assert.rejects(client.submit());
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'completed' }), { status: 200 });
    assert.equal(await client.check(), 'completed');
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'pending', userId: 'private' }), { status: 200 });
    await assert.rejects(client.check());
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Revoked', details: [] } }), { status: 401 });
    await assert.rejects(client.check(), { status: 401 });
  } finally { globalThis.fetch = original; }
});
