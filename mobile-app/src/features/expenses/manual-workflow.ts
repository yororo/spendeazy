import type { Session } from '../../application/session.ts';
import { requestFailureMessage } from '../../api/request-failure.ts';
import {
  defaultManualExpenseDraft, manualExpenseRequest, validateManualExpenseDraft,
  type ManualExpenseDraft, type ManualExpenseField, type ManualExpenseRequest,
} from './manual-draft.ts';

type ManualState = { saving: boolean; error: string | null; issues: Partial<Record<ManualExpenseField, string>> };
type ManualEvent =
  | { type: 'edited' }
  | { type: 'validationFailed'; issues: ManualState['issues'] }
  | { type: 'saveStarted' }
  | { type: 'saveFailed'; error: string }
  | { type: 'saveFinished' };

function manualReducer(state: ManualState, event: ManualEvent): ManualState {
  switch (event.type) {
    case 'edited': return { ...state, error: null };
    case 'validationFailed': return { ...state, issues: event.issues };
    case 'saveStarted': return { saving: true, issues: {}, error: null };
    case 'saveFailed': return { ...state, error: event.error };
    case 'saveFinished': return { ...state, saving: false };
  }
}

export function createManualExpenseWorkflow(
  session: Session,
  save: (spaceId: string, input: ManualExpenseRequest) => Promise<unknown>,
  today: () => string,
) {
  const scope = session.capture();
  const initial = defaultManualExpenseDraft(today());
  let state: ManualState = { saving: false, error: null, issues: {} };
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
    update(patch: Partial<ManualExpenseDraft>) {
      if (!session.isCurrent(scope) || state.saving) return;
      session.saveDraft({ ...draft(), ...patch });
      dispatch({ type: 'edited' });
    },
    async submit(activeCategoryIds: readonly string[]): Promise<'saved' | 'invalid' | 'failed' | 'obsolete' | 'busy'> {
      if (state.saving) return 'busy';
      if (!session.isCurrent(scope) || !scope.spaceId) return 'obsolete';
      const entered = draft();
      const issues = validateManualExpenseDraft(entered, today());
      if (entered.categoryId && !activeCategoryIds.includes(entered.categoryId)) {
        issues.push({ field: 'categoryId', message: 'Choose an active Category.' });
      }
      if (issues.length) {
        dispatch({ type: 'validationFailed', issues: Object.fromEntries(issues.map((issue) => [issue.field, issue.message])) });
        return 'invalid';
      }
      dispatch({ type: 'saveStarted' });
      try {
        await save(scope.spaceId, manualExpenseRequest(entered));
        if (!session.isCurrent(scope)) return 'obsolete';
        session.saveDraft(null);
        return 'saved';
      } catch (cause) {
        if (!session.isCurrent(scope)) return 'obsolete';
        dispatch({ type: 'saveFailed', error: `${requestFailureMessage(cause)} The entered Expense is still here.` });
        return 'failed';
      } finally {
        dispatch({ type: 'saveFinished' });
      }
    },
  };
}
