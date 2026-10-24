import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from '../../application/session.ts';
import { createManualExpenseWorkflow } from './manual-workflow.ts';
import { sessionRequest } from '../../application/session-request.ts';
import { ExpenseApiError, ExpenseApiTransportError, InvalidApiResponseError } from '../../api/request-failure.ts';

const eligible = { spaceId: 'personal', items: [{ id: 'food', isActive: true }] };

test('submission rejects repeated saves and an obsolete completion cannot clear a recovered draft', async () => {
  const session = createSession();
  session.observeIdentity('ada');
  session.changeSpace('personal');
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const workflow = createManualExpenseWorkflow(session, async () => pending, () => new Date('2026-10-24T00:00:00Z'));
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  const result = workflow.submit(eligible);
  assert.equal(await workflow.submit(eligible), 'busy');
  session.changeSpace('shared');
  finish();
  assert.equal(await result, 'obsolete');
  assert.equal(session.snapshot().draft?.description, 'Lunch');
  assert.equal(session.snapshot().draft?.categoryId, null);
});

test('submission failure retains work, same-identity recovery can save it, and explicit sign-out removes it', async () => {
  const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
  let expired = true;
  const makeWorkflow = () => {
    const run = sessionRequest(session, session.capture(), async () => { session.observeIdentity(null); });
    return createManualExpenseWorkflow(session, () => run(async () => {
      if (expired) throw new ExpenseApiError(401, 'UNAUTHORIZED', 'expired');
    }), () => new Date('2026-10-24T00:00:00Z'));
  };
  let workflow = makeWorkflow();
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  assert.equal(await workflow.submit(eligible), 'obsolete');
  session.observeIdentity('ada');
  workflow = makeWorkflow();
  assert.equal(workflow.draft().description, 'Lunch');
  expired = false;
  assert.equal(await workflow.submit(eligible), 'saved');
  assert.equal(session.snapshot().draft, null);
  workflow.update({ description: 'Private' });
  session.signOut();
  assert.equal(session.snapshot().draft, null);
  assert.equal(await workflow.submit(eligible), 'obsolete');
});

test('transport failure preserves input and an unavailable Category cannot be submitted', async () => {
  const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
  const workflow = createManualExpenseWorkflow(session, async () => { throw new ExpenseApiTransportError(); }, () => new Date('2026-10-24T00:00:00Z'));
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  assert.equal(await workflow.submit({ spaceId: 'personal', items: [] }), 'invalid');
  assert.equal(workflow.snapshot().issues.categoryId, 'Choose an active Category.');
  assert.equal(await workflow.submit(eligible), 'failed');
  assert.equal(workflow.draft().amount, '12');
  assert.match(workflow.snapshot().error ?? '', /connection/);
});

test('a successful workflow cannot submit a second Expense before leaving the form', async () => {
  const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
  let saved = 0;
  const workflow = createManualExpenseWorkflow(session, async () => { saved++; }, () => new Date('2026-10-24T00:00:00Z'));
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  assert.equal(await workflow.submit(eligible), 'saved');
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  assert.equal(await workflow.submit(eligible), 'busy');
  assert.equal(saved, 1);
});

test('expected failures retain exact draft values, require explicit retry, and translate invalid responses distinctly', async () => {
  for (const cause of [new ExpenseApiTransportError(), new InvalidApiResponseError(), new ExpenseApiError(422, 'VALIDATION_ERROR', 'Category is inactive')]) {
    const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
    let attempts = 0;
    const workflow = createManualExpenseWorkflow(session, async () => {
      if (++attempts === 1) throw cause;
    }, () => new Date('2026-10-24T00:00:00Z'));
    const entered = { amount: ' 12.5 ', description: ' Lunch ', categoryId: 'food', expenseDate: '2026-10-24' };
    workflow.update(entered);
    assert.equal(await workflow.submit(eligible), 'failed');
    assert.deepEqual(workflow.draft(), entered);
    assert.equal(workflow.snapshot().phase, 'ready');
    assert.equal(attempts, 1);
    assert.match(workflow.snapshot().error ?? '', cause instanceof InvalidApiResponseError ? /response could not be read/ : cause instanceof ExpenseApiTransportError ? /connection/ : /Category is inactive/);
    if (!(cause instanceof ExpenseApiError)) assert.match(workflow.snapshot().error ?? '', /may have been saved/);
    assert.equal(await workflow.submit(eligible), 'saved');
    assert.equal(session.snapshot().draft, null);
  }
});

test('identity or Space replacement ignores late success and failure without altering the current workflow', async () => {
  for (const replacement of ['identity', 'space']) {
    for (const fails of [false, true]) {
      const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
      let finish!: () => void;
      const pending = new Promise<void>(resolve => { finish = resolve; });
      const old = createManualExpenseWorkflow(session, async () => { await pending; if (fails) throw new InvalidApiResponseError(); }, () => new Date('2026-10-24T00:00:00Z'));
      old.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
      const saving = old.submit(eligible);
      if (replacement === 'identity') { session.observeIdentity('bea'); session.changeSpace('personal'); }
      else session.changeSpace('shared');
      const current = createManualExpenseWorkflow(session, async () => {}, () => new Date('2026-10-24T00:00:00Z'));
      if (replacement === 'identity') assert.equal(current.draft().description, '');
      else { assert.equal(current.draft().description, 'Lunch'); assert.equal(current.draft().categoryId, null); }
      current.update({ amount: '25', description: 'Current work', categoryId: 'new-category' });
      const before = current.snapshot();
      finish();
      assert.equal(await saving, 'obsolete');
      assert.equal(current.snapshot(), before);
      assert.equal(current.draft().description, 'Current work');
      assert.equal(current.draft().categoryId, 'new-category');
      assert.notEqual(old.snapshot().phase, 'saved');
    }
  }
});

test('submission refuses inactive or wrong-Space Category eligibility before saving', async () => {
  const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
  const workflow = createManualExpenseWorkflow(session, async () => { assert.fail('Ineligible Category reached save'); }, () => new Date('2026-10-24T00:00:00Z'));
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  assert.equal(await workflow.submit({ spaceId: 'shared', items: eligible.items }), 'invalid');
  assert.equal(await workflow.submit({ spaceId: 'personal', items: [{ id: 'food', isActive: false }] }), 'invalid');
  assert.equal(workflow.draft().description, 'Lunch');
});
