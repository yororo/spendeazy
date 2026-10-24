import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpenseBrowseWorkflow } from './browse-workflow.ts';
import { emptyExpenseBrowse } from './browse-state.ts';
import type { ExpensePagePayload } from '../../api/expense-response.ts';
import { ExpenseApiTransportError, InvalidApiResponseError } from '../../api/request-failure.ts';
import { createSession } from '../../application/session.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('initial failure can be retried and distinguishes transport from invalid responses', async () => {
  let response: ExpensePagePayload | Error = new ExpenseApiTransportError();
  const workflow = createExpenseBrowseWorkflow(emptyExpenseBrowse('personal'), () => true, async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  await workflow.reload();
  assert.equal(workflow.snapshot().phase, 'error');
  assert.equal(workflow.snapshot().failure, 'transport');
  response = new InvalidApiResponseError();
  await workflow.retry();
  assert.equal(workflow.snapshot().failure, 'invalid-response');
  response = page('retried');
  await workflow.retry();
  assert.equal(workflow.snapshot().loaded?.expenses[0].id, 'retried');
  assert.equal(workflow.snapshot().error, null);
});

test('retrying pagination keeps existing results and selection totals', async () => {
  let fail = true;
  const workflow = createExpenseBrowseWorkflow(emptyExpenseBrowse('personal'), () => true, async (_space, query) => {
    if (!query.cursor) return page('first', 'next');
    if (fail) throw new ExpenseApiTransportError();
    assert.equal(query.cursor, 'next');
    return page('second');
  });
  await workflow.reload();
  await workflow.loadMore();
  assert.deepEqual(workflow.snapshot().loaded?.expenses.map(item => item.id), ['first']);
  fail = false;
  await workflow.retry();
  assert.deepEqual(workflow.snapshot().loaded?.expenses.map(item => item.id), ['first', 'second']);
  assert.equal(workflow.snapshot().loaded?.totalCount, '7');
});

test('obsolete failures cannot overwrite a newer replacement or its loading state', async () => {
  const responses = [deferred<ExpensePagePayload>(), deferred<ExpensePagePayload>()];
  let index = 0;
  const workflow = createExpenseBrowseWorkflow(emptyExpenseBrowse('personal'), () => true, () => responses[index++].promise);
  const older = workflow.reload();
  const newer = workflow.reload();
  responses[0].reject(new ExpenseApiTransportError()); await older;
  assert.equal(workflow.snapshot().phase, 'loading');
  assert.equal(workflow.snapshot().error, null);
  responses[1].resolve(page('new')); await newer;
  assert.equal(workflow.snapshot().loaded?.expenses[0].id, 'new');
});

test('filter replacement ignores obsolete results before cancellation runs', async () => {
  let query = 'old';
  const response = deferred<ExpensePagePayload>();
  const old = createExpenseBrowseWorkflow({ ...emptyExpenseBrowse('personal'), description: 'old' }, () => query === 'old', () => response.promise);
  const pending = old.reload();
  query = 'new';
  const current = createExpenseBrowseWorkflow({ ...emptyExpenseBrowse('personal'), description: 'new' }, () => query === 'new', async (_space, request) => {
    assert.equal(request.description, 'new');
    assert.equal(request.cursor, undefined);
    return page('filtered');
  });
  await current.reload();
  response.resolve(page('obsolete')); await pending;
  assert.equal(old.snapshot().loaded, null);
  assert.equal(current.snapshot().loaded?.expenses[0].id, 'filtered');
});

for (const change of ['identity', 'space', 'signOut'] as const) {
  for (const failure of [false, true]) {
    test(`${change} hides private results and rejects late ${failure ? 'failure' : 'success'}`, async () => {
      const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
      const scope = session.capture();
      const response = deferred<ExpensePagePayload>();
      let first = true;
      const workflow = createExpenseBrowseWorkflow(emptyExpenseBrowse('personal'), () => session.isCurrent(scope), () => {
        if (first) { first = false; return Promise.resolve(page('private', 'next')); }
        return response.promise;
      });
      await workflow.reload();
      const pending = workflow.loadMore();
      if (change === 'identity') session.observeIdentity('grace');
      else if (change === 'space') session.changeSpace('shared');
      else session.signOut();
      assert.equal(workflow.snapshot().loaded, null);
      if (failure) response.reject(new ExpenseApiTransportError()); else response.resolve(page('late'));
      await pending;
      assert.equal(workflow.snapshot().loaded, null);
      assert.equal(workflow.snapshot().error, null);
    });
  }
}

test('invalid filters do not start a request and cancelled operations cannot settle', async () => {
  const invalid = createExpenseBrowseWorkflow({ ...emptyExpenseBrowse('personal'), fromDate: 'bad' }, () => true, async () => { assert.fail('invalid filter requested'); });
  await invalid.reload();
  const response = deferred<ExpensePagePayload>();
  const workflow = createExpenseBrowseWorkflow(emptyExpenseBrowse('personal'), () => true, () => response.promise);
  const pending = workflow.reload(); workflow.cancel();
  response.resolve(page('cancelled')); await pending;
  assert.equal(workflow.snapshot().loaded, null);
});
const page = (id: string, nextCursor: string | null = null): ExpensePagePayload => ({ expenses: [{ id, categoryId: 'food', description: id, amount: '10.00', expenseDate: '2026-10-24', source: 'manual', addedByUserId: null, statementImportId: null, createdAt: 'now', updatedAt: 'now', revision: '1' }], nextCursor, totalCount: '7', totalAmount: '70.00' });

for (const refreshFirst of [true, false]) {
  test(`refresh replaces pagination in either completion order (refresh first: ${refreshFirst})`, async () => {
    const requests: ReturnType<typeof deferred<ExpensePagePayload>>[] = [];
    const workflow = createExpenseBrowseWorkflow(emptyExpenseBrowse('personal'), () => true, async () => {
      const request = deferred<ExpensePagePayload>(); requests.push(request); return request.promise;
    });
    assert.equal(workflow.snapshot().phase, 'loading');
    const initial = workflow.reload(); requests[0].resolve(page('old', 'next')); await initial;
    const append = workflow.loadMore();
    await workflow.loadMore();
    assert.equal(requests.length, 2);
    const refresh = workflow.reload();
    if (refreshFirst) { requests[2].resolve(page('fresh')); await refresh; requests[1].resolve(page('obsolete')); await append; }
    else { requests[1].resolve(page('obsolete')); await append; assert.equal(workflow.snapshot().phase, 'refreshing'); requests[2].resolve(page('fresh')); await refresh; }
    assert.deepEqual(workflow.snapshot().loaded?.expenses.map(item => item.id), ['fresh']);
    assert.equal(workflow.snapshot().loaded?.totalAmount, '70.00');
    assert.equal(workflow.snapshot().phase, 'ready');
  });
}
