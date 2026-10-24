import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession } from '../../application/session.ts';
import { createManualExpenseWorkflow } from './manual-workflow.ts';
import { sessionRequest } from '../../application/session-request.ts';
import { ExpenseApiError, ExpenseApiTransportError } from '../../api/request-failure.ts';

test('submission rejects repeated saves and an obsolete completion cannot clear a recovered draft', async () => {
  const session = createSession();
  session.observeIdentity('ada');
  session.changeSpace('personal');
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const workflow = createManualExpenseWorkflow(session, async () => pending, () => '2026-10-24');
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  const result = workflow.submit(['food']);
  assert.equal(await workflow.submit(['food']), 'busy');
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
    }), () => '2026-10-24');
  };
  let workflow = makeWorkflow();
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  assert.equal(await workflow.submit(['food']), 'obsolete');
  session.observeIdentity('ada');
  workflow = makeWorkflow();
  assert.equal(workflow.draft().description, 'Lunch');
  expired = false;
  assert.equal(await workflow.submit(['food']), 'saved');
  assert.equal(session.snapshot().draft, null);
  workflow.update({ description: 'Private' });
  session.signOut();
  assert.equal(session.snapshot().draft, null);
  assert.equal(await workflow.submit(['food']), 'obsolete');
});

test('transport failure preserves input and an unavailable Category cannot be submitted', async () => {
  const session = createSession(); session.observeIdentity('ada'); session.changeSpace('personal');
  const workflow = createManualExpenseWorkflow(session, async () => { throw new ExpenseApiTransportError(); }, () => '2026-10-24');
  workflow.update({ amount: '12', description: 'Lunch', categoryId: 'food' });
  assert.equal(await workflow.submit([]), 'invalid');
  assert.equal(workflow.snapshot().issues.categoryId, 'Choose an active Category.');
  assert.equal(await workflow.submit(['food']), 'failed');
  assert.equal(workflow.draft().amount, '12');
  assert.match(workflow.snapshot().error ?? '', /connection/);
});
