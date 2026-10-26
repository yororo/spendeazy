import {
  ExpenseApiError,
  requestFailureMessage,
} from "../../api/request-failure.ts";
import type { ListedExpense } from "../../api/expense-response.ts";
import type { UpdateExpenseInput } from "../../api/expense-api-client.ts";
import {
  prepareManualExpense,
  type ManualCategoryEligibility,
  type ManualExpenseDraft,
  type ManualExpenseField,
} from "./manual-draft.ts";

type ExpenseEditPhase = "ready" | "saving" | "reviewing";

export type ExpenseEditState = {
  open: boolean;
  phase: ExpenseEditPhase;
  base: ListedExpense | null;
  draft: ManualExpenseDraft | null;
  issues: Partial<Record<ManualExpenseField, string>>;
  error: string | null;
  needsReview: boolean;
  latest: ListedExpense | null;
};

export type ExpenseEditResult =
  "saved" | "invalid" | "failed" | "conflict" | "obsolete" | "busy";

const FIELDS: readonly ManualExpenseField[] = [
  "amount",
  "description",
  "categoryId",
  "expenseDate",
];

export function createExpenseEditWorkflow(
  scope: { spaceId: string },
  isCurrent: () => boolean,
  api: {
    read: (spaceId: string, expenseId: string) => Promise<ListedExpense>;
    update: (
      spaceId: string,
      expenseId: string,
      input: UpdateExpenseInput,
    ) => Promise<ListedExpense>;
  },
  now: () => Date = () => new Date(),
) {
  const empty: ExpenseEditState = {
    open: false,
    phase: "ready",
    base: null,
    draft: null,
    issues: {},
    error: null,
    needsReview: false,
    latest: null,
  };
  let state = empty;
  let generation = 0;
  let touched = new Set<ManualExpenseField>();
  const listeners = new Set<() => void>();

  function publish(next: ExpenseEditState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function currentDraft(expense: ListedExpense): ManualExpenseDraft {
    return {
      amount: expense.amount,
      description: expense.description,
      categoryId: expense.categoryId,
      expenseDate: expense.expenseDate,
    };
  }

  function begin(expense: ListedExpense): void {
    if (!isCurrent()) return;
    generation += 1;
    touched = new Set();
    publish({
      ...empty,
      open: true,
      base: expense,
      draft: currentDraft(expense),
    });
  }

  function cancel(): void {
    generation += 1;
    touched = new Set();
    publish(empty);
  }

  function update(patch: Partial<ManualExpenseDraft>): void {
    if (
      !isCurrent() ||
      !state.open ||
      state.phase !== "ready" ||
      state.needsReview ||
      !state.draft
    )
      return;
    for (const field of FIELDS) {
      if (Object.hasOwn(patch, field)) touched.add(field);
    }
    publish({
      ...state,
      draft: { ...state.draft, ...patch },
      issues: {},
      error: null,
    });
  }

  function eligibilityForDraft(
    eligibility: ManualCategoryEligibility,
    base: ListedExpense,
    draft: ManualExpenseDraft,
  ): ManualCategoryEligibility {
    const items = eligibility.items.map((category) =>
      category.id === base.categoryId && draft.categoryId === base.categoryId
        ? { ...category, isActive: true }
        : category,
    );
    if (
      draft.categoryId === base.categoryId &&
      !items.some((category) => category.id === base.categoryId)
    ) {
      items.push({ id: base.categoryId, isActive: true });
    }
    return { spaceId: eligibility.spaceId, items };
  }

  function changedInput(
    base: ListedExpense,
    prepared: {
      amount: string;
      description: string;
      categoryId: string;
      expenseDate: string;
    },
  ): UpdateExpenseInput {
    const input: UpdateExpenseInput = { expectedRevision: base.revision };
    if (prepared.amount !== base.amount) input.amount = prepared.amount;
    if (prepared.description !== base.description)
      input.description = prepared.description;
    if (prepared.categoryId !== base.categoryId)
      input.categoryId = prepared.categoryId;
    if (prepared.expenseDate !== base.expenseDate)
      input.expenseDate = prepared.expenseDate;
    return input;
  }

  async function submit(
    categories: ManualCategoryEligibility,
  ): Promise<ExpenseEditResult> {
    if (!isCurrent()) return "obsolete";
    if (
      !state.open ||
      state.phase !== "ready" ||
      state.needsReview ||
      !state.base ||
      !state.draft
    )
      return "busy";
    const operation = generation;
    const base = state.base;
    const prepared = prepareManualExpense(state.draft, {
      now: now(),
      spaceId: scope.spaceId,
      categories: eligibilityForDraft(categories, base, state.draft),
    });
    if (!prepared.ok) {
      publish({
        ...state,
        issues: Object.fromEntries(
          prepared.issues.map((issue) => [issue.field, issue.message]),
        ),
        error: null,
      });
      return "invalid";
    }

    const input = changedInput(base, prepared.input);
    const hasChanges = Object.keys(input).some(
      (key) => key !== "expectedRevision",
    );
    if (!hasChanges) {
      cancel();
      return "saved";
    }

    publish({ ...state, phase: "saving", issues: {}, error: null });
    try {
      await api.update(scope.spaceId, base.id, input);
      if (!isCurrent() || generation !== operation) return "obsolete";
      cancel();
      return "saved";
    } catch (cause) {
      if (!isCurrent() || generation !== operation) return "obsolete";
      if (cause instanceof ExpenseApiError && cause.code === "STALE_EDIT") {
        publish({
          ...state,
          phase: "ready",
          needsReview: true,
          latest: null,
          error:
            "This Expense changed after you opened it. Review the latest details before continuing.",
        });
        return "conflict";
      }
      publish({
        ...state,
        phase: "ready",
        error: `${requestFailureMessage(cause)} The entered Expense draft is still here.`,
      });
      return "failed";
    }
  }

  async function reviewLatest(): Promise<boolean> {
    if (
      !isCurrent() ||
      !state.open ||
      !state.needsReview ||
      !state.base ||
      !state.draft
    )
      return false;
    const operation = generation;
    const base = state.base;
    const draft = state.draft;
    publish({ ...state, phase: "reviewing", error: null });
    try {
      const latest = await api.read(scope.spaceId, base.id);
      if (!isCurrent() || generation !== operation || !state.open) return false;
      const nextDraft = currentDraft(latest);
      for (const field of touched) {
        switch (field) {
          case "amount":
            nextDraft.amount = draft.amount;
            break;
          case "description":
            nextDraft.description = draft.description;
            break;
          case "categoryId":
            nextDraft.categoryId = draft.categoryId;
            break;
          case "expenseDate":
            nextDraft.expenseDate = draft.expenseDate;
            break;
        }
      }
      publish({
        ...state,
        phase: "ready",
        draft: nextDraft,
        latest,
        error: null,
      });
      return true;
    } catch (cause) {
      if (!isCurrent() || generation !== operation) return false;
      publish({
        ...state,
        phase: "ready",
        error: `${requestFailureMessage(cause)} Your draft is still here.`,
      });
      return false;
    }
  }

  function continueWithMyChanges(): void {
    if (
      !isCurrent() ||
      !state.open ||
      !state.needsReview ||
      !state.latest ||
      !state.draft
    )
      return;
    publish({
      ...state,
      base: state.latest,
      latest: null,
      needsReview: false,
      error: null,
    });
  }

  return {
    snapshot: () => (isCurrent() ? state : empty),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin,
    cancel,
    update,
    submit,
    reviewLatest,
    continueWithMyChanges,
  };
}
