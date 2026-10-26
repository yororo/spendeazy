import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCategoriesApiClient,
  readSpaceCategories,
  type CategoryConfigurationSave,
} from './categories-api-client.ts';
import { requestFailure } from './request-failure.ts';

const category = {
  id: '8',
  name: 'Coffee',
  description: null,
  iconKey: 'coffee',
  colorKey: 'cocoa',
  isActive: true,
  revision: '4',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};
const configuration = {
  category,
  budget: { amount: '500.00', currency: 'PHP', recurrence: 'monthly' },
  rules: [{ id: '31', categoryId: '8', pattern: 'Cafe Luna', matchType: 'contains' }],
  rulesRevision: '12',
};
const options = {
  baseUrl: 'https://example.invalid',
  getAccessToken: async () => 'token',
};

test('Category configuration reads decode identity, complete rules and the two revisions', async (t) => {
  const client = createCategoriesApiClient(options);
  t.mock.method(globalThis, 'fetch', async () => Response.json(configuration));
  const result = await client.getCategoryConfiguration('4', '8');
  assert.equal(result.category.colorKey, 'cocoa');
  assert.equal(result.category.revision, '4');
  assert.equal(result.rulesRevision, '12');
  assert.deepEqual(result.rules[0], {
    id: '31', categoryId: '8', pattern: 'Cafe Luna', matchType: 'contains',
  });
  assert.deepEqual(result.budget, {
    amount: '500.00', currency: 'PHP', recurrence: 'monthly',
  });
});

test('Category configuration creation sends the complete atomic draft and accepts zero Rule revision', async (t) => {
  const client = createCategoriesApiClient(options);
  const draft: CategoryConfigurationSave = {
    name: 'Cafe visits',
    iconKey: 'coffee',
    colorKey: 'cocoa',
    isActive: true,
    budget: null,
    rules: [{ pattern: 'Cafe Luna', matchType: 'contains' }],
    expectedRevision: null,
    expectedRulesRevision: '0',
  };
  let request: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (_input: string | URL | Request, init?: RequestInit) => {
    request = init;
    return Response.json(configuration);
  });
  const result = await client.createCategoryConfiguration('4', draft);
  assert.equal(result.category.id, '8');
  assert.equal(request?.method, 'POST');
  assert.deepEqual(JSON.parse(String(request?.body)), draft);
});

test('Space Category Rule snapshots decode their shared revision and complete rule set', async (t) => {
  const client = createCategoriesApiClient(options);
  const rules = {
    revision: '13',
    rules: [{ id: '31', categoryId: '5', pattern: 'Cafe Luna', matchType: 'contains' }],
  };
  let requestedUrl = '';
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return Response.json(rules);
  });

  const result = await client.getCategoryRules('4');
  assert.equal(requestedUrl, 'https://example.invalid/api/v1/users/me/spaces/4/category-rules');
  assert.deepEqual(result, {
    revision: '13',
    rules: [{ id: '31', categoryId: '5', pattern: 'Cafe Luna', matchType: 'contains' }],
  });
  assert.equal(await client.getRulesRevision('4'), '13');
});

test('category decoding rejects missing shared-catalog keys and malformed revisions', async (t) => {
  for (const payload of [
    [{ ...category, colorKey: undefined, color: 'teal' }],
    [{ ...category, iconKey: 'unknown' }],
    [{ ...category, revision: 0 }],
  ]) {
    assert.throws(() => readSpaceCategories(payload), (error) => requestFailure(error) === 'invalid-response');
  }
  const client = createCategoriesApiClient(options);
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    ...configuration,
    budget: { amount: '500', currency: 'PHP', recurrence: 'monthly' },
  }));
  await assert.rejects(
    client.getCategoryConfiguration('4', '8'),
    (error) => requestFailure(error) === 'invalid-response',
  );
});
