import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeletionTransport } from './deletion-transport.ts';
import { ObsoleteRequestError } from '../../api/request-failure.ts';

test('account credentials survive financial clearing; live credential replacement rejects both request outcomes', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [200, 401]) {
      let current = true;
      const client = createDeletionTransport({ userId: 'owner', sessionId: 'session' }, {
        current: () => current, token: async () => 'fictional',
      }, 'https://example.test');
      globalThis.fetch = async () => {
        current = false; // Clerk changes before React observes it.
        return new Response(JSON.stringify(status === 200 ? { status: 'completed' } : { error: { code: 'UNAUTHORIZED', message: 'Revoked', details: [] } }), { status });
      };
      await assert.rejects(client.check(), ObsoleteRequestError);
    }
    const client = createDeletionTransport({ userId: 'owner', sessionId: 'session' }, { current: () => true, token: async () => 'fictional' }, 'https://example.test');
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'pending' }));
    assert.equal(await client.check(), 'pending'); // No financial session capability is required.
  } finally { globalThis.fetch = original; }
});
