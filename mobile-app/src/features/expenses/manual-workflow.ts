import type { Session } from '../../application/session.ts';
import { requestFailureMessage } from '../../api/request-failure.ts';
import {
  defaultManualExpenseDraft, manualExpenseRequest, validateManualExpenseDraft,
  type ManualExpenseDraft, type ManualExpenseField, type ManualExpenseRequest,
} from './manual-draft.ts';

export function createManualExpenseWorkflow(
  session: Session,
  save: (spaceId: string, input: ManualExpenseRequest) => Promise<unknown>,
  today: () => string,
) {
  const scope = session.capture();
  const initial = defaultManualExpenseDraft(today());
  let state = { saving: false, error: null as string | null, issues: {} as Partial<Record<ManualExpenseField, string>> };
  const listeners = new Set<() => void>();
  function publish(patch: Partial<typeof state>) {
    state = { ...state, ...patch };
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
      publish({ error: null });
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
        publish({ issues: Object.fromEntries(issues.map((issue) => [issue.field, issue.message])) });
        return 'invalid';
      }
      publish({ saving: true, issues: {}, error: null });
      try {
        await save(scope.spaceId, manualExpenseRequest(entered));
        if (!session.isCurrent(scope)) return 'obsolete';
        session.saveDraft(null);
        return 'saved';
      } catch (cause) {
        if (!session.isCurrent(scope)) return 'obsolete';
        publish({ error: `${requestFailureMessage(cause)} The entered Expense is still here.` });
        return 'failed';
      } finally {
        publish({ saving: false });
      }
    },
  };
}
