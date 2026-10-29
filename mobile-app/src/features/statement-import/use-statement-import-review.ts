import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { createCategoriesApiClient } from '@/api/categories-api-client';
import { useAuthorizedClient } from '@/application/authorized-client';
import { session, statementImportStore as store } from '@/application/session-runtime';
import { loadReviewCatalog } from './review-catalog-loader';
import type { ReviewEvent } from './review-state';
import type { ReviewValues } from './review-model';
import { orderedRows, unmappedRows, validAssignment } from './review-rules';

export function useStatementImportReview() {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const access = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const authorized = useAuthorizedClient();
  const draftId = 'draftId' in state ? state.draftId : null;
  const canReview = state.phase === 'ready' || state.phase === 'review' || state.phase === 'review-ready';
  const refresh = useCallback(() => {
    void loadReviewCatalog(store, createCategoriesApiClient(authorized), Crypto.randomUUID());
  }, [authorized]);
  useEffect(() => {
    if (!canReview) return;
    const scope = store.captureReview();
    if (scope) store.initializeReview(scope);
    // A recovered generation/remount starts a new fenced request, even if the old one was loading.
    if (store.snapshot().phase === 'review') refresh();
  }, [canReview, draftId, refresh]);
  const review = 'review' in state ? state.review ?? null : null;
  const send = (event: ReviewEvent) => {
    const scope = store.captureReview();
    if (scope) store.updateReview(scope, event);
  };
  const rows = review ? orderedRows(review) : [];
  const unmapped = review ? unmappedRows(review) : [];
  return {
    phase: state.phase, review, refresh, readOnly: !access.spaceWritable || !access.userId || access.notice !== null,
    rows: review ? rows.filter(row => review.ledgerFilter === 'all' || (review.ledgerFilter === 'excluded'
      ? row.inclusion !== 'included' : row.inclusion === 'included' && !validAssignment(review, row))) : [],
    counts: { all: rows.length, unmapped: unmapped.length, excluded: rows.filter(row => row.inclusion !== 'included').length },
    send,
    patch(patch: Partial<ReviewValues>) {
      if (review?.editor) send({ type: 'editorChanged', editor: { ...review.editor, values: { ...review.editor.values, ...patch } } });
    },
    save: () => send({ type: 'saved', now: new Date(), localId: Crypto.randomUUID() }),
    continue: () => send({ type: 'continued', now: new Date() }),
    backToReview() { const scope = store.captureReview(); if (scope) store.backToReview(scope); },
  };
}
