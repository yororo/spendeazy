import type { CommittedImport, ImportConfirmationApi, ImportPreview } from '../../api/statement-import-confirmation-api-client.ts';
import { ExpenseApiError, requestFailureMessage } from '../../api/request-failure.ts';
import { serializeConfirmation } from './confirmation-payload.ts';
import type { ReviewHandoff } from './review-model.ts';
import type { ImportAccess } from './import-store.ts';

export type ImportReceipt = Readonly<{ userId: string; spaceId: string; operationId: string }>;
export type ReceiptWriter = (receipt: ImportReceipt) => Promise<void>;
type Phase = 'idle' | 'previewing' | 'ready' | 'saving' | 'uncertain' | 'failed' | 'committed';
type Snapshot = { phase: Phase; preview: ImportPreview | null; message: string | null; result: CommittedImport | null };
type Frozen = { json: string; receipt: ImportReceipt; generation: number; handoff: ReviewHandoff };
type ConfirmationEvent =
  | { type: 'reset' | 'previewStarted' | 'saveStarted' }
  | { type: 'previewSucceeded'; preview: ImportPreview }
  | { type: 'notice' | 'uncertain'; message: string }
  | { type: 'rejected'; message: string; preview: ImportPreview | null }
  | { type: 'committed'; result: CommittedImport };

export function confirmationReducer(state: Snapshot, event: ConfirmationEvent): Snapshot {
  switch (event.type) {
    case 'reset': return { phase: 'idle', preview: null, message: null, result: null };
    case 'previewStarted': return { ...state, phase: 'previewing', preview: null, message: null };
    case 'previewSucceeded': return { ...state, phase: 'ready', preview: event.preview, message: null };
    case 'saveStarted': return { ...state, phase: 'saving', message: null };
    case 'notice': return { ...state, message: event.message };
    case 'uncertain': return { ...state, phase: 'uncertain', message: event.message };
    case 'rejected': return { ...state, phase: event.preview ? 'ready' : 'failed', preview: event.preview, message: event.message };
    case 'committed': return { ...state, phase: 'committed', result: event.result, message: null };
  }
}

/** Application-lifetime memory only. #154 supplies the durable minimal receipt writer. */
export function createConfirmationWorkflow(deps: {
  access(): ImportAccess; handoff(): ReviewHandoff | null;
  lock(locked: boolean): void; complete(): void; refresh(): void;
}) {
  let state: Snapshot = { phase: 'idle', preview: null, message: null, result: null };
  let version = 0;
  let bound: ReviewHandoff | null = null;
  let generation = -1;
  let frozen: Frozen | null = null;
  const listeners = new Set<() => void>();
  const publish = (event: ConfirmationEvent) => { state = confirmationReducer(state, event); for (const listener of listeners) listener(); };
  const current = (handoff: ReviewHandoff, g: number) => {
    const a = deps.access();
    return a.authenticated && a.generation === g && a.userId === handoff.owner.userId && a.spaceId === handoff.owner.spaceId && deps.handoff() === handoff;
  };
  function synchronize() {
    const a = deps.access();
    if (frozen) {
      if (a.ownerUserId !== frozen.receipt.userId) { frozen = null; deps.lock(false); }
      else return;
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
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    synchronize,
    async preview(api: ImportConfirmationApi) {
      synchronize();
      const h = deps.handoff(); const g = deps.access().generation;
      if (!h || frozen || !current(h, g)) return;
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
      if (state.phase === 'saving' || state.phase === 'committed') return;
      const h = deps.handoff(); const a = deps.access();
      if (!h || !a.writable || !current(h, a.generation)) return;
      if (!beforeSend) { publish({ type: 'notice', message: 'Import saving is unavailable until secure submission recovery is connected.' }); return; }
      if (!frozen) {
        if (state.phase !== 'ready' || !state.preview || (state.preview.warnings.length > 0 && !override)) return;
        const acknowledgment = state.preview.warnings.length ? { ids: state.preview.warnings.map(w => w.id), digest: state.preview.warningDigest } : { ids: [], digest: null };
        frozen = { json: JSON.stringify(serializeConfirmation(h, acknowledgment)), receipt: { ...h.owner, operationId: operationId() }, generation: a.generation, handoff: h };
        deps.lock(true);
      }
      const attempt = frozen;
      if (attempt.generation !== a.generation || attempt.handoff !== h) return;
      publish({ type: 'saveStarted' });
      let sent = false;
      try {
        await beforeSend(attempt.receipt);
        if (frozen !== attempt) return;
        if (!current(h, attempt.generation)) { publish({ type: 'uncertain', message: 'Submission paused. Restore the original session to resolve this operation.' }); return; }
        sent = true;
        const result = await api.confirm(attempt.receipt.spaceId, attempt.receipt.operationId, attempt.json);
        if (frozen !== attempt) return;
        if (!current(h, attempt.generation)) { publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed in this session.' }); return; }
        frozen = null; deps.lock(false);
        publish({ type: 'committed', result });
        deps.complete(); deps.refresh();
      } catch (error) {
        if (frozen !== attempt) return;
        if (!current(h, attempt.generation)) { publish({ type: 'uncertain', message: 'Saving hasn’t been confirmed in this session.' }); return; }
        // Only known application rejections prove that this attempt did not commit.
        const definitive = error instanceof ExpenseApiError && [400, 403, 404, 409, 413, 415].includes(error.status) && error.code !== 'IMPORT_OPERATION_PAYLOAD_CONFLICT';
        if (!sent || definitive) {
          frozen = null; deps.lock(false);
          const preview = error instanceof ExpenseApiError && error.code === 'IMPORT_REVIEW_REQUIRED' ? error.review as ImportPreview : null;
          publish({ type: 'rejected', preview, message: !sent ? 'The submission receipt could not be saved. Nothing was sent. Try again.' : requestFailureMessage(error) });
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
