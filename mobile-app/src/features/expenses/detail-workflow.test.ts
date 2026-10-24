import assert from 'node:assert/strict';
import test from 'node:test';
import { ExpenseApiError, ExpenseApiTransportError, InvalidApiResponseError } from '../../api/request-failure.ts';
import type { ListedExpense } from '../../api/expense-response.ts';
import { createSession } from '../../application/session.ts';
import { createExpenseDetailWorkflow } from './detail-workflow.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('a valid Expense response becomes the loaded detail', async () => {
  const workflow = createExpenseDetailWorkflow({ spaceId: 'personal', expenseId: '1' }, () => true, async () => expense('Cafe'));
  assert.equal(workflow.snapshot().phase, 'loading');
  assert.equal(await workflow.load(), true);
  assert.equal(workflow.snapshot().phase, 'ready');
  assert.equal(workflow.snapshot().expense?.description, 'Cafe');
  assert.equal(workflow.snapshot().expense?.amount, '10.00');
  assert.equal(workflow.snapshot().error, null);
});

test('transport, invalid-response, and API failures stay retryable until a valid Expense arrives', async () => {
  let response: ListedExpense | Error = new ExpenseApiTransportError();
  const workflow = createExpenseDetailWorkflow({ spaceId: 'personal', expenseId: '1' }, () => true, async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  assert.equal(await workflow.load(), false);
  assert.equal(workflow.snapshot().phase, 'error');
  assert.equal(workflow.snapshot().failure, 'transport');
  assert.equal(workflow.snapshot().error, 'Could not reach Spendeazy. Check your connection and try again.');
  assert.equal(workflow.snapshot().expense, null);
  response = new InvalidApiResponseError();
  await workflow.retry();
  assert.equal(workflow.snapshot().failure, 'invalid-response');
  assert.equal(workflow.snapshot().error, 'The API response could not be read. Try again.');
  response = new ExpenseApiError(404, 'NOT_FOUND', 'This Expense is not in the Space.');
  await workflow.retry();
  assert.equal(workflow.snapshot().failure, 'rejected');
  assert.equal(workflow.snapshot().error, 'This Expense is not in the Space.');
  response = expense('Cafe');
  assert.equal(await workflow.retry(), true);
  assert.equal(workflow.snapshot().phase, 'ready');
  assert.equal(workflow.snapshot().expense?.description, 'Cafe');
  assert.equal(workflow.snapshot().failure, null);
});

test('retry keeps only the newest success or failure', async () => {
  const responses = [deferred<ListedExpense>(), deferred<ListedExpense>()];
  let index = 0;
  const workflow = createExpenseDetailWorkflow({ spaceId: 'personal', expenseId: '1' }, () => true, () => responses[index++].promise);
  const older = workflow.load();
  const newer = workflow.retry();
  responses[0].resolve(expense('obsolete'));
  await older;
  assert.equal(workflow.snapshot().phase, 'loading');
  assert.equal(workflow.snapshot().expense, null);
  responses[1].reject(new ExpenseApiTransportError());
  await newer;
  assert.equal(workflow.snapshot().failure, 'transport');
  assert.equal(workflow.snapshot().expense, null);

  const again = [deferred<ListedExpense>(), deferred<ListedExpense>()];
  index = 0;
  const replacement = createExpenseDetailWorkflow({ spaceId: 'personal', expenseId: '1' }, () => true, () => again[index++].promise);
  const first = replacement.load();
  const second = replacement.retry();
  again[0].reject(new InvalidApiResponseError());
  await first;
  assert.equal(replacement.snapshot().phase, 'loading');
  assert.equal(replacement.snapshot().error, null);
  again[1].resolve(expense('current'));
  await second;
  assert.equal(replacement.snapshot().expense?.description, 'current');
  assert.equal(replacement.snapshot().failure, null);
});

for (const change of ['identity', 'space', 'expense'] as const) {
  for (const failure of [false, true]) {
    test(`${change} hides the Expense and drops a late ${failure ? 'failure' : 'success'}`, async () => {
      const session = createSession();
      session.observeIdentity('ada');
      session.changeSpace('personal');
      const scope = session.capture();
      let expenseId = '1';
      const response = deferred<ListedExpense>();
      let first = true;
      const workflow = createExpenseDetailWorkflow({ spaceId: 'personal', expenseId: '1' }, () => session.isCurrent(scope) && expenseId === '1', () => {
        if (first) { first = false; return Promise.resolve(expense('Cafe')); }
        return response.promise;
      });
      await workflow.load();
      const pending = workflow.retry();
      if (change === 'identity') session.observeIdentity('grace');
      else if (change === 'space') session.changeSpace('shared');
      else expenseId = '2';
      assert.equal(workflow.snapshot().expense, null);
      assert.equal(workflow.snapshot().error, null);
      if (failure) response.reject(new ExpenseApiTransportError());
      else response.resolve(expense('late'));
      await pending;
      assert.equal(workflow.snapshot().expense, null);
      assert.equal(workflow.snapshot().error, null);
      assert.equal(workflow.snapshot().failure, null);
    });
  }
}

test('a cancelled read cannot publish a success or failure', async () => {
  const response = deferred<ListedExpense>();
  const workflow = createExpenseDetailWorkflow({ spaceId: 'personal', expenseId: '1' }, () => true, () => response.promise);
  const pending = workflow.load();
  workflow.cancel();
  response.resolve(expense('cancelled'));
  await pending;
  assert.equal(workflow.snapshot().expense, null);
  assert.equal(workflow.snapshot().error, null);
});

const expense = (description: string, id = '1'): ListedExpense => ({
  id, categoryId: 'food', description, amount: '10.00', expenseDate: '2026-10-24', source: 'manual',
  addedByUserId: 'ada', statementImportId: null, createdAt: 'now', updatedAt: 'now', revision: '1',
});
