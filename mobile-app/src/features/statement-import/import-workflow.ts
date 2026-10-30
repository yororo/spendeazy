import type { createImportStore } from './import-store.ts';
import type { ImportOperation } from './import-state.ts';
import type { ImportFile } from './import-model.ts';
import type { EngineMessage } from './extraction-bridge.ts';
import { InterpretationFailure, interpretStatement } from './providers.ts';

type Asset = { uri: string; name: string };
type Dependencies = {
  store: ReturnType<typeof createImportStore>;
  pick(): Promise<{ canceled: boolean; assets: Asset[] | null }>;
  track(uri: string): void; release(uri: string): void; sweep(): void;
  prepare(asset: Asset, current: () => boolean): Promise<{ identity: ImportFile; base64: string }>;
};
export type ExtractionRequest = { id: string; base64: string | null };

/** Application lifetime workflow. The route is only a subscriber; Back does not destroy work. */
export function createImportWorkflow(deps: Dependencies) {
  let request: ExtractionRequest | null = null;
  let operation: ImportOperation | null = null;
  let pending: Promise<void> = Promise.resolve();
  let cleanup: 'starting' | 'ready' | 'failed' = 'starting';
  let initialized = false;
  let selecting = false;
  const listeners = new Set<() => void>();
  let snapshot: { request: ExtractionRequest | null; cleanup: 'starting' | 'ready' | 'failed' } = { request, cleanup };
  function publish() { snapshot = { request, cleanup }; for (const listener of listeners) listener(); }
  function current(op: ImportOperation) { const state = deps.store.snapshot(); return 'operation' in state && state.operation === op; }
  function clear() { if (request) request.base64 = null; request = null; operation = null; publish(); }
  async function recover() {
    cleanup = 'starting'; publish();
    await pending;
    try { deps.sweep(); cleanup = 'ready'; } catch { cleanup = 'failed'; }
    publish();
  }
  function fail(op: ImportOperation, error: 'picker-failed' | 'prepare-failed' | 'unreadable' | 'cleanup-failed' | 'unsupported' | 'no-usable-rows') {
    if (current(op)) deps.store.deliver(op, { type: 'failed', error });
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => snapshot,
    initialize() { if (!initialized) { initialized = true; void recover(); } },
    recover,
    async cleanupPrivateResources() {
      clear();
      await pending;
      deps.sweep();
      cleanup = 'ready'; publish();
    },
    async select(draftId: string, op: ImportOperation) {
      if (selecting || cleanup !== 'ready' || !deps.store.start(draftId, op)) return;
      selecting = true; operation = op;
      deps.store.onInvalidate(op, () => {
        cleanup = 'starting';
        clear();
        // Await late picker/hash outcomes before sweeping and admitting a new selection.
        void Promise.resolve().then(recover);
      });
      const run = async () => {
        let staging: string | null = null;
        let stage: 'picker-failed' | 'prepare-failed' = 'picker-failed';
        try {
          const result = await deps.pick();
          if (result.canceled || !result.assets?.[0]) { deps.store.cancel(op); return; }
          const asset = result.assets[0];
          staging = asset.uri;
          deps.track(staging);
          if (!current(op)) return;
          deps.store.deliver(op, { type: 'picked' }); stage = 'prepare-failed';
          const prepared = await deps.prepare(asset, () => current(op));
          if (!current(op)) { prepared.base64 = ''; return; }
          deps.store.deliver(op, { type: 'prepared', file: prepared.identity });
          request = { id: op.id, base64: prepared.base64 }; prepared.base64 = ''; publish();
        } catch { fail(op, stage); }
        finally {
          if (staging) {
            try { deps.release(staging); } catch { cleanup = 'failed'; publish(); fail(op, 'cleanup-failed'); }
          }
          selecting = false;
        }
      };
      pending = run();
      await pending;
    },
    cancel() { const op = operation; if (op) deps.store.cancel(op); },
    discard() { deps.store.discard(); },
    consumeBytes(id: string) {
      if (!request || request.id !== id) return null;
      const value = request.base64; request.base64 = null; return value;
    },
    passwordSent(id: string) { if (operation?.id === id) deps.store.deliver(operation, { type: 'passwordSubmitted' }); },
    engineFailed(id: string) { if (operation?.id === id) fail(operation, 'unreadable'); },
    receive(message: EngineMessage) {
      const op = operation;
      if (!op || !current(op) || message.id !== op.id) return;
      if (message.type === 'ready') deps.store.deliver(op, { type: 'workerReady' });
      if (message.type === 'progress') deps.store.deliver(op, { type: 'progress', completedPages: message.completedPages, totalPages: message.totalPages });
      if (message.type === 'password') deps.store.deliver(op, { type: 'passwordRequired', reason: message.incorrect ? 'incorrect' : 'required' });
      if (message.type === 'error') fail(op, 'unreadable');
      if (message.type === 'result') {
        const state = deps.store.snapshot();
        if (state.phase !== 'extracting' || !state.file) return;
        deps.store.deliver(op, { type: 'extracted' });
        try {
          const result = interpretStatement({ draftId: state.draftId, owner: state.owner, file: state.file, pages: message.pages, extractionEngineVersion: message.extractionEngineVersion });
          // Resource cleanup must succeed before publishing the #152 boundary.
          deps.sweep();
          deps.store.deliver(op, { type: 'interpreted', result });
        } catch (error) {
          fail(op, error instanceof InterpretationFailure ? error.code : 'cleanup-failed');
        } finally { message.pages.length = 0; }
      }
    },
  };
}
