import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createStatementImportConfirmationApiClient, decodeCommittedImport, decodeImportPreview } from './statement-import-confirmation-api-client.ts';
import { ExpenseApiError, InvalidApiResponseError } from './request-failure.ts';
import { serializeConfirmation } from '../features/statement-import/confirmation-payload.ts';
import { confirmationHandoff } from '../features/statement-import/confirmation.fixture.ts';

const id = '11111111-1111-4111-8111-111111111111';
const preview = { warningDigest: 'a'.repeat(64), warnings: [{ id: 'warn', type: 'reconciliation', message: 'Review original controls.', sourceRowIds: [], expenseIds: [], statementImportIds: [] }] };
const result = { status: 'committed', operationId: id, statementImportId: '7', confirmedAt: '2026-10-30T00:00:00.000Z', originalExpenseCount: '2', originalExpenseTotal: '1300.00' };
test('adapter uses the published preview/operation routes and preserves frozen wire content', async () => {
  const previous = globalThis.fetch; const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(calls.length === 1 ? preview : result), { status: calls.length === 1 ? 200 : 201 }); };
  try {
    const api = createStatementImportConfirmationApiClient({ baseUrl: 'https://fictional.invalid', getAccessToken: async () => 'test-token' });
    const payload = serializeConfirmation(confirmationHandoff()); const frozen = JSON.stringify(payload);
    assert.deepEqual(await api.preview('7', payload), preview);
    assert.deepEqual(await api.confirm('7', id, frozen), result);
    assert.equal(calls[0].url, 'https://fictional.invalid/api/v1/users/me/spaces/7/statement-import-previews');
    assert.equal(calls[1].url, `https://fictional.invalid/api/v1/users/me/spaces/7/statement-import-operations/${id}`);
    assert.equal(calls[1].init?.method, 'PUT'); assert.equal(calls[1].init?.body, frozen);
  } finally { globalThis.fetch = previous; }
});
test('adapter decodes typed refreshed warnings and rejects malformed success or conflict responses', async () => {
  const previous = globalThis.fetch;
  try {
    const api = createStatementImportConfirmationApiClient({ baseUrl: 'https://fictional.invalid', getAccessToken: async () => 'test-token' });
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'IMPORT_REVIEW_REQUIRED', message: 'Review again.', details: [], review: preview } }), { status: 409 });
    await assert.rejects(api.confirm('7', id, '{}'), error => { assert.ok(error instanceof ExpenseApiError); assert.deepEqual(error.review, preview); return true; });
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'IMPORT_REVIEW_REQUIRED', message: 'Review again.', details: [], review: {} } }), { status: 409 });
    await assert.rejects(api.confirm('7', id, '{}'), InvalidApiResponseError);
    assert.throws(() => decodeCommittedImport({ ...result, operationId: 'other' }, id), InvalidApiResponseError);
    assert.throws(() => decodeCommittedImport({ ...result, originalExpenseTotal: 1300 }, id), InvalidApiResponseError);
    assert.throws(() => decodeImportPreview({ ...preview, warnings: [...preview.warnings, ...preview.warnings] }), InvalidApiResponseError);
  } finally { globalThis.fetch = previous; }
});
test('mobile response models and methods match the generated OpenAPI contract', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../api/docs/openapi.json', import.meta.url), 'utf8'));
  assert.ok(contract.paths['/api/v1/users/me/spaces/{spaceId}/statement-import-previews'].post);
  const operation = contract.paths['/api/v1/users/me/spaces/{spaceId}/statement-import-operations/{operationId}'];
  assert.ok(operation.put.responses['201']); assert.ok(operation.put.responses['200']); assert.equal(operation.get, undefined);
  assert.deepEqual(Object.keys(result).sort(), [...contract.components.schemas.CommittedImportResultDto.required].sort());
  assert.deepEqual(Object.keys(preview).sort(), [...contract.components.schemas.ImportPreviewDto.required].sort());
  assert.deepEqual(Object.keys(preview.warnings[0]).sort(), [...contract.components.schemas.ImportAdvisoryWarningDto.required].sort());
});
