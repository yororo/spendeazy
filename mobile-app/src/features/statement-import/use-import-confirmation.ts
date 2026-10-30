import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuthorizedClient } from '@/application/authorized-client';
import { session, statementImportStore, confirmationReceipts } from '@/application/session-runtime';
import { useSpaces } from '@/application/spaces/provider';
import { createStatementImportConfirmationApiClient } from '@/api/statement-import-confirmation-api-client';
import { confirmationSummary, type ReceiptWriter } from './confirmation-workflow';

export function useImportConfirmation(beforeSend: ReceiptWriter = confirmationReceipts.write) {
  const { loading, error } = useSpaces();
  const authorized = useAuthorizedClient();
  const api = useMemo(() => createStatementImportConfirmationApiClient(authorized), [authorized]);
  const workflow = session.confirmation;
  const state = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot);
  const draft = useSyncExternalStore(statementImportStore.subscribe, statementImportStore.snapshot, statementImportStore.snapshot);
  const handoff = draft.phase === 'review-ready' ? draft.review.handoff : null;
  const receipt = workflow.receipt();
  useEffect(() => {
    if (!loading && !error && receipt) void workflow.checkStatus(api);
  }, [api, receipt, loading, error, workflow]);
  useEffect(() => {
    workflow.synchronize();
    if (handoff && workflow.snapshot().phase === 'idle') void workflow.preview(api);
  }, [api, handoff, workflow]);
  return {
    ...state, receipt, handoff, summary: handoff ? confirmationSummary(handoff) : null,
    locked: receipt !== null || state.phase === 'saving',
    canRetry: workflow.canRetry(),
    checkStatus: () => { void workflow.checkStatus(api); },
    acknowledge: workflow.acknowledge,
    canSend: beforeSend !== undefined,
    retryPreview: () => { void workflow.preview(api); },
    submit: (override = false) => { void workflow.submit(api, Crypto.randomUUID, beforeSend, override); },
    back() { const scope = statementImportStore.captureReview(); if (scope) statementImportStore.backToReview(scope); },
  };
}
