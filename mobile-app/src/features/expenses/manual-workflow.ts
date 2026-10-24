import type { Session } from '../../application/session.ts';
import { requestFailure, requestFailureMessage } from '../../api/request-failure.ts';
import {
  defaultManualExpenseDraft, prepareManualExpense, todayInManila,
  type ManualCategoryEligibility, type ManualExpenseDraft, type ManualExpenseField, type ManualExpenseRequest,
} from './manual-draft.ts';

type ManualState = {
  phase: 'ready' | 'saving' | 'saved';
  error: string | null;
  issues: Partial<Record<ManualExpenseField, string>>;
};
type ManualEvent =
  | { type: 'edited' }
  | { type: 'validationFailed'; issues: ManualState['issues'] }
  | { type: 'saveStarted' }
  | { type: 'saveCancelled' }
  | { type: 'saveFailed'; error: string }
  | { type: 'saveSucceeded' };

function manualReducer(state: ManualState, event: ManualEvent): ManualState {
  switch (event.type) {
    case 'edited': return { ...state, error: null, issues: {} };
    case 'validationFailed': return { ...state, error: null, issues: event.issues };
    case 'saveStarted': return { phase: 'saving', issues: {}, error: null };
    case 'saveCancelled': return { ...state, phase: 'ready' };
    case 'saveFailed': return { ...state, phase: 'ready', error: event.error };
    case 'saveSucceeded': return { phase: 'saved', issues: {}, error: null };
  }
}

export function createManualExpenseWorkflow(
  session: Session,
  save: (spaceId: string, input: ManualExpenseRequest) => Promise<unknown>,
  now: () => Date,
) {
  const scope = session.capture();
  const initial = defaultManualExpenseDraft(todayInManila(now()));
  let active = true;
  let generation = 0;
  const isCurrent = () => active && session.isCurrent(scope);
  let state: ManualState = { phase: 'ready', error: null, issues: {} };
  const listeners = new Set<() => void>();
  function dispatch(event: ManualEvent) {
    state = manualReducer(state, event);
    for (const listener of listeners) listener();
  }
  const draft = () => session.snapshot().draft ?? initial;
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    draft,
    isCurrent,
    activate() { active = true; },
    cancel() {
      active = false;
      generation++;
      if (state.phase === 'saving') dispatch({ type: 'saveCancelled' });
    },
    update(patch: Partial<ManualExpenseDraft>) {
      if (!isCurrent() || state.phase !== 'ready') return;
      session.saveDraft({ ...draft(), ...patch });
      dispatch({ type: 'edited' });
    },
    async submit(categories: ManualCategoryEligibility): Promise<'saved' | 'invalid' | 'failed' | 'obsolete' | 'busy'> {
      if (!isCurrent() || !scope.spaceId) return 'obsolete';
      if (state.phase !== 'ready') return 'busy';
      const operationGeneration = generation;
      const acceptsCompletion = () => isCurrent() && generation === operationGeneration;
      const prepared = prepareManualExpense(draft(), { now: now(), spaceId: scope.spaceId, categories });
      if (!prepared.ok) {
        dispatch({ type: 'validationFailed', issues: Object.fromEntries(prepared.issues.map((issue) => [issue.field, issue.message])) });
        return 'invalid';
      }
      dispatch({ type: 'saveStarted' });
      try {
        await save(scope.spaceId, prepared.input);
        if (!acceptsCompletion()) return 'obsolete';
        session.saveDraft(null);
        dispatch({ type: 'saveSucceeded' });
        return 'saved';
      } catch (cause) {
        if (!acceptsCompletion()) return 'obsolete';
        const failure = requestFailure(cause);
        const uncertainty = failure === 'transport' || failure === 'invalid-response'
          ? ' The Expense may have been saved. Check Expenses before trying again.' : '';
        dispatch({ type: 'saveFailed', error: `${requestFailureMessage(cause)}${uncertainty} The entered Expense is still here.` });
        return 'failed';
      }
    },
  };
}
