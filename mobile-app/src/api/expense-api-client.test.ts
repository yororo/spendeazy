import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpenseApiClient } from './expense-api-client.ts';
import { requestFailure } from './request-failure.ts';

const expense = { id: '1', categoryId: '2', expenseDate: '2026-10-24', description: 'Cafe', amount: '10.00', source: 'manual', createdAt: 'now', updatedAt: 'now', revision: '1', transportOnly: true };
const options = { baseUrl: 'https://example.invalid', getAccessToken: async () => 'token' };

test('Expense detail and pages return the same decoded application model', async (t) => {
  const client = createExpenseApiClient(options);
  t.mock.method(globalThis, 'fetch', async () => Response.json(expense));
  const detail = await client.getExpense('personal', '1');
  assert.equal(detail.addedByUserId, null);
  assert.equal('transportOnly' in detail, false);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ expenses: [expense], nextCursor: null, totalCount: '1', totalAmount: '10.00' }));
  assert.deepEqual((await client.listExpenses('personal')).expenses, [detail]);
  assert.deepEqual((await client.listDeletedExpenses('personal')).expenses, [detail]);
});

test('malformed Expense detail and pages are invalid responses', async (t) => {
  const client = createExpenseApiClient(options);
  for (const payload of [{ ...expense, amount: 10 }, { expenses: [expense], totalCount: '1', totalAmount: '10.00' }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
    await assert.rejects(client.listExpenses('personal'), cause => requestFailure(cause) === 'invalid-response');
    await assert.rejects(client.getExpense('personal', '1'), cause => requestFailure(cause) === 'invalid-response');
    t.mock.restoreAll();
  }
});
