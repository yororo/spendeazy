import type { ImportResult } from './import-model.ts';
import type { ReviewCatalog, ReviewEditor, ReviewRequest, ReviewState } from './review-model.ts';
import { decimalAmount } from './values.ts';
import { editorDirty, editorFor, matchUnmapped, prepareReviewEdit, unmappedRows, validateReview } from './review-rules.ts';

export function initializeReview(original: ImportResult): ReviewState {
  return {
    original, revision: 0,
    rows: Object.fromEntries(original.rows.map(row => [row.sourceRowId, {
      sourceRowId: row.sourceRowId,
      values: { amount: row.classification.eligible ? decimalAmount(row.classification.expenseMinor) : '',
        description: row.description, expenseDate: row.date ?? '', categoryId: null },
      inclusion: row.classification.eligible ? 'included' : 'locked-excluded', assignment: null,
    }])),
    editor: null, pendingQueueEditor: null, queueSourceRowId: null, deferredSourceRowIds: [],
    ledgerFilter: 'all', stagedRules: [], catalog: { status: 'idle', request: null, snapshot: null }, handoff: null,
  };
}

export type ReviewEvent =
  | { type: 'rowOpened'; sourceRowId: string }
  | { type: 'queueReturned' }
  | { type: 'editorAbandoned' }
  | { type: 'saved'; now: Date; localId: string }
  | { type: 'skipped' }
  | { type: 'excluded'; sourceRowId: string }
  | { type: 'restored'; sourceRowId: string }
  | { type: 'skippedReviewed' }
  | { type: 'continued'; now: Date }
  | { type: 'editorChanged'; editor: ReviewEditor | null }
  | { type: 'filterChanged'; filter: ReviewState['ledgerFilter'] }
  | { type: 'catalogRequested'; request: ReviewRequest }
  | { type: 'catalogSucceeded'; request: ReviewRequest; catalog: ReviewCatalog; applyMatching?: boolean }
  | { type: 'catalogFailed'; request: ReviewRequest };

function sameRequest(a: ReviewRequest | null, b: ReviewRequest) {
  return a !== null && a.id === b.id && a.generation === b.generation && a.draftId === b.draftId &&
    a.owner.userId === b.owner.userId && a.owner.spaceId === b.owner.spaceId;
}

/** Ownership/access is checked by the application store before dispatch. All changes remain local. */
export function reviewReducer(state: ReviewState, event: ReviewEvent): ReviewState {
  switch (event.type) {
    case 'rowOpened': {
      const row = state.rows[event.sourceRowId];
      if (!row || state.editor?.sourceRowId === row.sourceRowId) return state;
      if (state.pendingQueueEditor?.sourceRowId === row.sourceRowId) return reviewReducer(state, { type: 'queueReturned' });
      // A ledger editor cannot replace another dirty ledger buffer.
      if (state.inspectedSourceRowId && editorDirty(state, state.editor)) {
        return { ...state, errors: ['Save or abandon these ledger edits before opening another Transaction.'] };
      }
      return { ...state, pendingQueueEditor: state.pendingQueueEditor ?? (state.inspectedSourceRowId ? null : state.editor),
        editor: row.inclusion === 'included' ? editorFor(row) : null, inspectedSourceRowId: row.sourceRowId, errors: [] };
    }
    case 'queueReturned': return state.inspectedSourceRowId && editorDirty(state, state.editor)
      ? { ...state, errors: ['Save or abandon these ledger edits before returning to the queue.'] }
      : state.pendingQueueEditor ? { ...state, editor: state.pendingQueueEditor, pendingQueueEditor: null, inspectedSourceRowId: null, errors: [] }
        : advance({ ...state, editor: null, inspectedSourceRowId: null, errors: [] });
    case 'editorAbandoned': return { ...state, editor: state.editor ? editorFor(state.rows[state.editor.sourceRowId]) : null, errors: [], handoff: null };
    case 'saved': {
      const prepared = prepareReviewEdit(state, event.now, event.localId);
      if (!prepared.ok) return { ...state, errors: prepared.errors };
      const next = matchUnmapped({ ...state, rows: { ...state.rows, [prepared.row.sourceRowId]: prepared.row },
        stagedRules: prepared.rule ? [...state.stagedRules, prepared.rule] : state.stagedRules,
        revision: state.revision + 1, handoff: null, editor: null, errors: [], validationIssues: [] });
      return advance(next);
    }
    case 'skipped': {
      if (!state.editor) return state;
      return advance({ ...state, deferredSourceRowIds: [...new Set([...state.deferredSourceRowIds, state.editor.sourceRowId])], editor: null, handoff: null, errors: [] });
    }
    case 'excluded': {
      const row = state.rows[event.sourceRowId];
      if (!row || row.inclusion !== 'included') return state;
      return advance({ ...state, rows: { ...state.rows, [row.sourceRowId]: { ...row, inclusion: 'user-excluded' } },
        editor: state.editor?.sourceRowId === row.sourceRowId ? null : state.editor,
        pendingQueueEditor: state.pendingQueueEditor?.sourceRowId === row.sourceRowId ? null : state.pendingQueueEditor,
        revision: state.revision + 1, handoff: null, errors: [], validationIssues: [] });
    }
    case 'restored': {
      const row = state.rows[event.sourceRowId];
      if (!row || row.inclusion !== 'user-excluded') return state;
      return advance(matchUnmapped({ ...state, rows: { ...state.rows, [row.sourceRowId]: { ...row, inclusion: 'included' } },
        deferredSourceRowIds: state.deferredSourceRowIds.filter(id => id !== row.sourceRowId),
        revision: state.revision + 1, handoff: null, errors: [], validationIssues: [] }));
    }
    case 'skippedReviewed': return advance({ ...state, deferredSourceRowIds: [], inspectedSourceRowId: null });
    case 'continued': {
      const result = validateReview(state, event.now);
      return { ...state, handoff: result.handoff, validationIssues: result.issues };
    }
    case 'editorChanged':
      if (event.editor && state.rows[event.editor.sourceRowId]?.inclusion !== 'included') return state;
      return { ...state, editor: event.editor, handoff: null, errors: [], validationIssues: [] };
    case 'filterChanged': return state.ledgerFilter === event.filter ? state : { ...state, ledgerFilter: event.filter };
    case 'catalogRequested': return { ...state, catalog: { ...state.catalog, status: 'loading', request: event.request }, handoff: null };
    case 'catalogFailed': return sameRequest(state.catalog.request, event.request)
      ? { ...state, catalog: { ...state.catalog, status: 'failed', request: null }, handoff: null } : state;
    case 'catalogSucceeded': {
      if (!sameRequest(state.catalog.request, event.request) || event.catalog.spaceId !== state.original.owner.spaceId) return state;
      const refreshed: ReviewState = { ...state, catalog: { status: 'ready', snapshot: event.catalog, request: null }, handoff: null,
        stagedRules: state.stagedRules.map(rule => ({ ...rule, rulesRevision: event.catalog.rulesRevision,
          categoryRevision: event.catalog.categories.find(c => c.id === rule.categoryId)?.revision ?? rule.categoryRevision })) };
      const next = event.applyMatching === false ? refreshed : matchUnmapped(refreshed);
      return next.editor ? next : advance(next);
    }
  }
}

function advance(state: ReviewState): ReviewState {
  if (state.pendingQueueEditor) return { ...state, editor: state.pendingQueueEditor, pendingQueueEditor: null, inspectedSourceRowId: null };
  if (state.editor) return state;
  const next = unmappedRows(state).find(row => !state.deferredSourceRowIds.includes(row.sourceRowId));
  return { ...state, queueSourceRowId: next?.sourceRowId ?? null, editor: next ? editorFor(next) : null, inspectedSourceRowId: null };
}
