import assert from 'node:assert/strict';
import test from 'node:test';

import { createStatementImportHistoryApiClient } from './statement-import-history-api-client.ts';
import { requestFailure } from './request-failure.ts';

test('Statement Import history adapter scopes a read to the selected Space and decodes retained metadata', async (t) => {
  const client = createStatementImportHistoryApiClient({ baseUrl: 'https://example.invalid', getAccessToken: async () => 'token' });
  let requestUrl = '';
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    requestUrl = String(url);
    return Response.json({ items: [{
      id: '18', fileName: 'june.pdf', statementDate: '2026-06-30', provider: 'BDO',
      accountFormat: null, statementType: 'credit_card', historyFromDate: null,
      historyToDate: null, totalDebit: null, importedAt: '2026-07-01T00:00:00.000Z',
      importedByUserId: '7', expenseCount: '12',
    }], nextCursor: null });
  });
  const page = await client.list('42');
  assert.equal(requestUrl, 'https://example.invalid/api/v1/users/me/spaces/42/statement-imports?pageSize=100');
  assert.equal(page.items[0]?.expenseCount, '12');
  assert.equal(page.items[0]?.fileName, 'june.pdf');
});

test('malformed Statement Import history is not exposed as application data', async (t) => {
  const client = createStatementImportHistoryApiClient({ baseUrl: 'https://example.invalid', getAccessToken: async () => 'token' });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ items: [], nextCursor: 3 }));
  await assert.rejects(client.list('42'), (cause) => requestFailure(cause) === 'invalid-response');
});
