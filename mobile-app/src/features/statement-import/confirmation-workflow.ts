import type { CommittedImport, ImportConfirmationApi, ImportPreview, ImportOperationStatus } from '../../api/statement-import-confirmation-api-client.ts';
import { requestFailureMessage } from '../../api/request-failure.ts';
import { serializeConfirmation } from './confirmation-payload.ts';
import type { ReviewHandoff } from './review-model.ts';
import type { ImportAccess } from './import-store.ts';
import type { ImportReceipt, ReceiptOwner } from './confirmation-receipt.ts';
export type { ImportReceipt } from './confirmation-receipt.ts';

export type ReceiptWriter = (receipt: ImportReceipt) => Promise<void>;
type Phase = 'idle' | 'previewing' | 'ready' | 'saving' | 'checking' | 'uncertain' | 'failed' | 'committed' | 'not_committed';
type Snapshot = { phase: Phase; preview: ImportPreview | null; message: string | null; result: CommittedImport | null };
type Frozen = { json: string; receipt: ImportReceipt; generation: number; handoff: ReviewHandoff };
function failureMessage(code: string) {
  if (code === 'SPACE_NOT_WRITABLE') return 'The destination is read-only. No Expenses were saved by this import.';
  if (code === 'IMPORT_REVIEW_REQUIRED') return 'The import warnings changed. Review them again before confirming.';
  if (code.startsWith('CATEGORY_RULE') || code.startsWith('CATEGORY_')) return 'The Categories or Rules changed. Refresh and check the review before confirming again.';
  if (code === 'VALIDATION_FAILED') return 'The statement review needs corrections. No Expenses were saved by this import.';
  return 'The server confirmed that this import saved no Expenses. You can review the statement again after acknowledgment.';
}
type ConfirmationEvent =
  | { type: 'reset' | 'previewStarted' | 'saveStarted' | 'checkingStarted' }
  | { type: 'previewSucceeded'; preview: ImportPreview }
  | { type: 'notice' | 'uncertain'; message: string }
  | { type: 'rejected'; message: string; preview: ImportPreview | null }
  | { type: 'notCommitted'; message: string }
  | { type: 'committed'; result: CommittedImport };

export function confirmationReducer(state: Snapshot, event: ConfirmationEvent): Snapshot {
  switch (event.type) {
    case 'reset': return { phase: 'idle', preview: null, message: null, result: null };
    case 'previewStarted': return { ...state, phase: 'previewing', preview: null, message: null };
    case 'previewSucceeded': return { ...state, phase: 'ready', preview: event.preview, message: null };
    case 'saveStarted': return { ...state, phase: 'saving', message: null };
    case 'checkingStarted': return { ...state, phase: 'checking', message: null };
    case 'notice': return { ...state, message: event.message };
    case 'uncertain': return { ...state, phase: 'uncertain', message: event.message };
    case 'rejected': return { ...state, phase: event.preview ? 'ready' : 'failed', result: null, preview: event.preview, message: event.message };
    case 'committed': return { ...state, phase: 'committed', result: event.result, message: null };
    case 'notCommitted': return { ...state, phase: 'not_committed', message: event.message, result: null };
  }
}

/** Frozen financial payloads stay in application memory; only the minimal receipt is durable. */
export function createConfirmationWorkflow(deps: {
  access(): ImportAccess; handoff(): ReviewHandoff | null;
  lock(locked: boolean): void; complete(): void; refresh(): void;
  receipts?: ReceiptOwner;
}) {
  let state: Snapshot = { phase: 'idle', preview: null, message: null, result: null };
  let version = 0;
  let bound: ReviewHandoff | null = null;
  let generation = -1;
  let frozen: Frozen | null = null;
  let receipt: ImportReceipt | null = null;
  let failure: Extract<ImportOperationStatus, { status: 'not_committed' }>['failure'] | null = null;
  let checkingGeneration = -1;
  const listeners = new Set<() => void>();
  const publish = (event: ConfirmationEvent) => { state = confirmationReducer(state, event); for (const listener of listeners) listener(); };
  const current = (handoff: ReviewHandoff, g: number) => {
    const a = deps.access();
    return a.authenticated && a.generation === g && a.userId === handoff.owner.userId && a.spaceId === handoff.owner.spaceId && deps.handoff() === handoff;
  };
  function synchronize() {
    const a = deps.access();
    if (receipt && a.ownerUserId !== receipt.userId) {
      version++; receipt = null; frozen = null; failure = null; deps.lock(false); publish({ type: 'reset' });
    }
    if (frozen) {
      if (a.ownerUserId !== frozen.receipt.userId) { frozen = null; deps.lock(false); }
      else {
        if ((state.phase === 'saving' && frozen.generation !== a.generation) || (state.phase === 'checking' && checkingGeneration !== a.generation)) {
          version++; publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed. Check status after signing in.' });
        }
        return;
      }
    }
    if (receipt) {
      if (state.phase === 'checking' && checkingGeneration !== a.generation) {
        version++; publish({ type: 'uncertain', message: 'Sign in again to check this operation.' });
      }
      return;
    }
    const h = deps.handoff();
    if (state.phase === 'committed' && h === null && generation === a.generation && bound?.owner.userId === a.ownerUserId) return;
    if (h !== bound || generation !== a.generation) {
      version++; bound = h; generation = a.generation;
      publish({ type: 'reset' });
    }
  }
  return {
    snapshot: () => state,
    receipt: () => receipt,
    hasReceipt: () => receipt !== null,
    canRetry: () => frozen !== null,
    async hydrate(userId: string) {
      if (!deps.receipts) return;
      const started = deps.access();
      if (!started.authenticated || started.userId !== userId) return;
      const startedGeneration = started.generation;
      const recovered = await deps.receipts.hydrate(userId);
      if (!deps.access().authenticated || deps.access().userId !== userId || deps.access().generation !== startedGeneration) return;
      if (recovered && !receipt) {
        receipt = recovered; deps.lock(true);
        if (state.phase !== 'saving') publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed. Check the original operation’s status.' });
      }
    },
    async checkStatus(api: ImportConfirmationApi) {
      const r = receipt; const a = deps.access();
      if (!r || !a.authenticated || a.userId !== r.userId || ['saving', 'checking', 'committed', 'not_committed'].includes(state.phase)) return;
      const request = ++version;
      const requestGeneration = a.generation;
      checkingGeneration = requestGeneration;
      publish({ type: 'checkingStarted' });
      const valid = () => request === version && receipt === r && deps.access().authenticated && deps.access().generation === requestGeneration;
      try {
        const status = await api.status(r.spaceId, r.operationId);
        if (!valid()) return;
        if (status.status === 'committed') {
          frozen = null; publish({ type: 'committed', result: status }); deps.complete(); deps.refresh();
        } else if (status.status === 'not_committed') {
          failure = status.failure; frozen = null;
          publish({ type: 'notCommitted', message: failureMessage(status.failure.code) });
        } else publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed. Check status again.' });
      } catch {
        if (valid()) publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed. Status is unavailable; check again.' });
      }
    },
    async acknowledge() {
      const r = receipt;
      if (!r || !['committed', 'not_committed'].includes(state.phase)) return false;
      try {
        await deps.receipts?.clearMatching(r);
        if (receipt !== r || !deps.access().authenticated) return false;
        receipt = null; frozen = null; deps.lock(false);
        const preview = failure?.review ?? null; failure = null;
        publish({ type: 'rejected', preview, message: preview ? 'Review the updated warnings before confirming again.' : 'You can start a new review or correct the living review.' });
        return true;
      } catch {
        if (receipt === r && deps.access().authenticated) publish({ type: 'notice', message: 'The receipt could not be cleared. Retry acknowledgment.' });
        return false;
      }
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    synchronize,
    async preview(api: ImportConfirmationApi) {
      synchronize();
      const h = deps.handoff(); const g = deps.access().generation;
      if (!h || frozen || receipt || !current(h, g)) return;
      const request = ++version;
      publish({ type: 'previewStarted' });
      try {
        const preview = await api.preview(h.owner.spaceId, serializeConfirmation(h));
        if (version === request && current(h, g)) publish({ type: 'previewSucceeded', preview });
      } catch (error) {
        if (version === request && current(h, g)) publish({ type: 'rejected', preview: null, message: requestFailureMessage(error) });
      }
    },
    async submit(api: ImportConfirmationApi, operationId: () => string, beforeSend?: ReceiptWriter, override = false) {
      if (['saving', 'checking', 'committed', 'not_committed'].includes(state.phase) || (receipt && !frozen)) return;
      const h = deps.handoff(); const a = deps.access();
      if (!h || !a.writable || !current(h, a.generation)) return;
      if (!beforeSend) { publish({ type: 'notice', message: 'Import saving is unavailable until secure submission recovery is connected.' }); return; }
      if (!frozen) {
        if (state.phase !== 'ready' || !state.preview || (state.preview.warnings.length > 0 && !override)) return;
        const acknowledgment = state.preview.warnings.length ? { ids: state.preview.warnings.map(w => w.id), digest: state.preview.warningDigest } : { ids: [], digest: null };
        frozen = { json: JSON.stringify(serializeConfirmation(h, acknowledgment)), receipt: { ...h.owner, operationId: operationId() }, generation: a.generation, handoff: h };
        deps.lock(true);
      }
      if (frozen.handoff !== h) return;
      frozen = { ...frozen, generation: a.generation };
      const attempt = frozen;
      publish({ type: 'saveStarted' });
      let sent = false;
      try {
        await beforeSend(attempt.receipt);
        if (frozen !== attempt) return;
        receipt = attempt.receipt;
        if (!current(h, attempt.generation)) {
          if (state.phase !== 'checking') publish({ type: 'uncertain', message: 'Submission paused. Restore the original session to resolve this operation.' });
          return;
        }
        sent = true;
        const result = await api.confirm(attempt.receipt.spaceId, attempt.receipt.operationId, attempt.json);
        if (frozen !== attempt) return;
        if (!current(h, attempt.generation)) {
          if (state.phase !== 'checking') publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed in this session.' });
          return;
        }
        frozen = null;
        publish({ type: 'committed', result });
        deps.complete(); deps.refresh();
      } catch {
        if (frozen !== attempt) return;
        if (!current(h, attempt.generation)) {
          if (state.phase !== 'checking') publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed in this session.' });
          return;
        }
        if (!sent && !receipt) {
          frozen = null; deps.lock(false);
          publish({ type: 'rejected', preview: null, message: 'The submission receipt could not be saved. Nothing was sent. Try again.' });
        } else publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed. Keep this review open; retry uses the same operation.' });
      }
    },
  };
}

export function confirmationSummary(handoff: ReviewHandoff) {
  const totals = new Map<string, bigint>();
  let total = 0n; let included = 0;
  for (const row of handoff.rows) {
    if (row.inclusion !== 'included' || row.amount === null || row.values.categoryId === null) continue;
    const amount = BigInt(row.amount.replace('.', ''));
    included++; total += amount;
    totals.set(row.values.categoryId, (totals.get(row.values.categoryId) ?? 0n) + amount);
  }
  return { found: handoff.original.rows.length, included, excluded: handoff.original.rows.length - included, total, categories: [...totals].map(([id, total]) => ({ category: handoff.catalog.categories.find(c => c.id === id)!, total })) };
}
