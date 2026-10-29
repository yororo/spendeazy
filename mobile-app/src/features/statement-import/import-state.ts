import type { ImportFile, ImportOwner, ImportResult } from './import-model.ts';
import type { ReviewHandoff, ReviewState } from './review-model.ts';
import { initializeReview, reviewReducer, type ReviewEvent } from './review-state.ts';

export type ImportOperation = Readonly<{ id: string; generation: number; owner: ImportOwner }>;
type Draft = Readonly<{ draftId: string; owner: ImportOwner }>;
type Running = Draft & Readonly<{ operation: ImportOperation; file: ImportFile | null }>;
export type ImportFailure = 'picker-failed' | 'prepare-failed' | 'unreadable' | 'unsupported' | 'no-usable-rows' | 'cleanup-failed';
export type ImportState =
  | Readonly<{ phase: 'idle' }>
  | (Running & Readonly<{ phase: 'picking' | 'preparing' | 'interpreting' }>)
  | (Running & Readonly<{ phase: 'extracting'; completedPages: number; totalPages: number | null }>)
  | (Running & Readonly<{ phase: 'password-required'; reason: 'required' | 'incorrect' }>)
  | (Draft & Readonly<{ phase: 'ready'; result: ImportResult }>)
  | (Draft & Readonly<{ phase: 'review'; result: ImportResult; review: ReviewState }>)
  | (Draft & Readonly<{ phase: 'review-ready'; result: ImportResult; review: ReviewState & { handoff: ReviewHandoff } }>)
  | (Draft & Readonly<{ phase: 'failed'; error: ImportFailure }>)
  | (Draft & Readonly<{ phase: 'suspended'; reason: 'authentication' | 'read-only' | 'reselection-required'; result: ImportResult | null;
      review?: ReviewState; resumePhase?: 'review' | 'review-ready' }>);
export type ImportOutcome =
  | { type: 'picked' }
  | { type: 'prepared'; file: ImportFile }
  | { type: 'workerReady' }
  | { type: 'progress'; completedPages: number; totalPages: number }
  | { type: 'passwordRequired'; reason: 'required' | 'incorrect' }
  | { type: 'passwordSubmitted' }
  | { type: 'extracted' }
  | { type: 'interpreted'; result: ImportResult }
  | { type: 'failed'; error: ImportFailure };
export type ImportEvent =
  | { type: 'started'; draftId: string; operation: ImportOperation }
  | { type: 'outcome'; operation: ImportOperation; outcome: ImportOutcome }
  | { type: 'discarded' }
  | { type: 'suspended'; reason: 'authentication' | 'read-only' }
  | { type: 'recovered' }
  | { type: 'reviewInitialized' }
  | { type: 'reviewChanged'; event: ReviewEvent }
  | { type: 'reviewReopened' };

export function sameOwner(a: ImportOwner, b: ImportOwner) {
  return a.userId === b.userId && a.spaceId === b.spaceId;
}
export function matchesOperation(state: ImportState, operation: ImportOperation) {
  return 'operation' in state && state.operation.id === operation.id &&
    state.operation.generation === operation.generation && sameOwner(state.owner, operation.owner);
}
export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  if (event.type === 'discarded') return { phase: 'idle' };
  if (event.type === 'reviewInitialized') {
    return state.phase === 'ready' ? { ...state, phase: 'review', review: initializeReview(state.result) } : state;
  }
  if (event.type === 'reviewReopened') {
    return state.phase === 'review-ready' ? { ...state, phase: 'review' } : state;
  }
  if (event.type === 'reviewChanged') {
    if (state.phase !== 'review') return state;
    const review = reviewReducer(state.review, event.event);
    if (review === state.review) return state;
    return event.event.type === 'continued' && review.handoff
      ? { ...state, phase: 'review-ready', review: { ...review, handoff: review.handoff } } : { ...state, review };
  }
  if (event.type === 'started') {
    if (state.phase !== 'idle' && state.phase !== 'suspended' && state.phase !== 'failed') return state;
    if (state.phase === 'suspended' && state.result !== null) return state;
    if (state.phase !== 'idle' && !sameOwner(state.owner, event.operation.owner)) return state;
    return { phase: 'picking', draftId: event.draftId, owner: event.operation.owner, operation: event.operation, file: null };
  }
  if (event.type === 'suspended') {
    if (state.phase === 'idle') return state;
    if (state.phase === 'suspended' && state.reason === event.reason) return state;
    return { phase: 'suspended', draftId: state.draftId, owner: state.owner, reason: event.reason,
      result: 'result' in state ? state.result : null,
      ...('review' in state && state.review ? { review: state.review,
        resumePhase: state.phase === 'suspended' ? state.resumePhase : state.phase as 'review' | 'review-ready' } : {}) };
  }
  if (event.type === 'recovered') {
    if (state.phase !== 'suspended') return state;
    if (!state.result && state.reason === 'reselection-required') return state;
    if (state.result && state.review) {
      const base = { draftId: state.draftId, owner: state.owner, result: state.result };
      return state.resumePhase === 'review-ready' && state.review.handoff
        ? { ...base, phase: 'review-ready', review: { ...state.review, handoff: state.review.handoff } }
        : { ...base, phase: 'review', review: state.review };
    }
    return state.result ? { phase: 'ready', draftId: state.draftId, owner: state.owner, result: state.result }
      : { ...state, reason: 'reselection-required' };
  }
  if (!matchesOperation(state, event.operation) || !('operation' in state)) return state;
  const outcome = event.outcome;
  switch (outcome.type) {
    case 'picked': return state.phase === 'picking' ? { ...state, phase: 'preparing' } : state;
    case 'prepared': return state.phase === 'preparing' ? { ...state, file: outcome.file } : state;
    case 'workerReady': return state.phase === 'preparing' && state.file
      ? { ...state, phase: 'extracting', completedPages: 0, totalPages: null } : state;
    case 'progress': return state.phase === 'extracting' && Number.isInteger(outcome.totalPages) &&
      Number.isInteger(outcome.completedPages) && outcome.completedPages >= state.completedPages &&
      outcome.completedPages <= outcome.totalPages && outcome.totalPages > 0
      ? { ...state, completedPages: outcome.completedPages, totalPages: outcome.totalPages } : state;
    case 'passwordRequired': return state.phase === 'extracting' ? { ...state, phase: 'password-required', reason: outcome.reason } : state;
    case 'passwordSubmitted': return state.phase === 'password-required'
      ? { ...state, phase: 'extracting', completedPages: 0, totalPages: null } : state;
    case 'extracted': return state.phase === 'extracting' ? { ...state, phase: 'interpreting' } : state;
    case 'interpreted': return state.phase === 'interpreting' && outcome.result.draftId === state.draftId &&
      sameOwner(outcome.result.owner, state.owner) && state.file !== null &&
      outcome.result.file.sha256 === state.file.sha256 && outcome.result.rows.length > 0
      ? { phase: 'ready', draftId: state.draftId, owner: state.owner, result: outcome.result } : state;
    case 'failed': return { phase: 'failed', draftId: state.draftId, owner: state.owner, error: outcome.error };
  }
}
