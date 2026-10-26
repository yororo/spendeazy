import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createExpenseApiClient } from "@/api/expense-api-client";
import { ExpenseApiError } from "@/api/request-failure";
import { useAuthorizedClient } from "@/application/authorized-client";
import { useSpaces } from "@/application/spaces/provider";
import type { ExpenseDetailViewState } from "./detail-view";
import { createExpenseDetailWorkflow } from "./detail-workflow";
import { createExpenseEditWorkflow } from "./expense-edit-workflow";
import { noteManualExpenseSaved } from "./browse-state";
import { useSpaceCategories } from "./use-space-categories";
import { spaceIdentityLabel } from "@/application/spaces/active-space";
import type { ExpenseActivitySnapshot } from "@/api/expense-response";
import type { ManualExpenseDraft } from "./manual-draft";

export function useExpenseDetail(expenseId: string) {
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  const spaceId = active?.id ?? null;
  const categories = useSpaceCategories(spaceId);
  const api = useMemo(() => createExpenseApiClient(authorized), [authorized]);
  const workflow = useMemo(
    () =>
      createExpenseDetailWorkflow(
        { spaceId: spaceId ?? "", expenseId },
        () =>
          authorized.isCurrent() &&
          spaceId !== null &&
          authorized.scope.spaceId === spaceId,
        api.getExpense,
        api.listExpenseActivity,
      ),
    [api, authorized, expenseId, spaceId],
  );
  const editWorkflow = useMemo(
    () =>
      createExpenseEditWorkflow(
        { spaceId: spaceId ?? "" },
        () =>
          authorized.isCurrent() &&
          spaceId !== null &&
          authorized.scope.spaceId === spaceId,
        { read: api.getExpense, update: api.updateExpense },
      ),
    [api, authorized, spaceId],
  );
  const loaded = useSyncExternalStore(
    workflow.subscribe,
    workflow.snapshot,
    workflow.snapshot,
  );
  const edit = useSyncExternalStore(
    editWorkflow.subscribe,
    editWorkflow.snapshot,
    editWorkflow.snapshot,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    if (!spaceId) return;
    void workflow.load();
    return () => {
      workflow.cancel();
      editWorkflow.cancel();
    };
  }, [editWorkflow, spaceId, workflow]);
  const expense = loaded.phase === "ready" ? loaded.expense : null;
  const category = categories.categories.find(
    (item) => item.id === expense?.categoryId,
  );
  const addedBy = active?.members.find(
    (member) => member.id === expense?.addedByUserId,
  );
  const canEdit =
    active?.accessLevel === "write" &&
    active.status === "active" &&
    expense !== null &&
    expense.deletedAt === undefined;
  const categoryName = (categoryId: string) =>
    categories.categories.find((item) => item.id === categoryId)?.name ??
    "Category";
  const activitySnapshot = (snapshot: ExpenseActivitySnapshot | undefined) =>
    snapshot
      ? {
          ...snapshot,
          categoryName: categoryName(snapshot.categoryId),
        }
      : null;
  const editCategories = categories.categories.map((item) => ({
    id: item.id,
    name: item.name,
    isActive: item.isActive,
  }));
  const editCanSave =
    canEdit &&
    edit.phase === "ready" &&
    !categories.loading &&
    !categories.error;
  const state: ExpenseDetailViewState = {
    phase: !spaceId || loaded.phase === "loading" ? "loading" : loaded.phase,
    error: loaded.phase === "error" ? loaded.error : null,
    spaceName: active ? spaceIdentityLabel(active) : "Space",
    activity:
      loaded.phase === "ready"
        ? loaded.activity.map((event) => ({
            id: event.id,
            type: event.type,
            actorName:
              active?.members.find((member) => member.id === event.actorUserId)
                ?.name ?? "Deleted user",
            occurredAt: event.occurredAt,
            before: activitySnapshot(event.before),
            after: activitySnapshot(event.after),
          }))
        : [],
    expense: expense
      ? {
          id: expense.id,
          description: expense.description,
          amount: expense.amount,
          expenseDate: expense.expenseDate,
          categoryName: category?.name ?? "Category",
          source: expense.source,
          addedByName: addedBy?.name ?? null,
          statementImportId: expense.statementImportId,
          sourceRowId: expense.sourceRowId,
          deletedAt: expense.deletedAt ?? null,
        }
      : null,
    canEdit,
    editor: {
      open: edit.open,
      phase: edit.phase,
      draft: edit.draft,
      issues: edit.issues,
      error: edit.error,
      needsReview: edit.needsReview,
      latest: edit.latest
        ? {
            description: edit.latest.description,
            amount: edit.latest.amount,
            expenseDate: edit.latest.expenseDate,
            categoryName: categoryName(edit.latest.categoryId),
          }
        : null,
      categories: editCategories,
      canSave: editCanSave,
    },
    deleting,
    deleteError,
  };
  return {
    state,
    load: workflow.load,
    retry: workflow.retry,
    beginEdit() {
      if (canEdit && expense) editWorkflow.begin(expense);
    },
    updateEdit(patch: Partial<ManualExpenseDraft>) {
      editWorkflow.update(patch);
    },
    cancelEdit() {
      editWorkflow.cancel();
    },
    reviewLatest: editWorkflow.reviewLatest,
    continueWithMyChanges: editWorkflow.continueWithMyChanges,
    async saveEdit() {
      if (!spaceId || !editCanSave) return false;
      const result = await editWorkflow.submit({
        spaceId,
        items: categories.categories.map((item) => ({
          id: item.id,
          isActive: item.isActive,
        })),
      });
      if (result !== "saved" || !authorized.isCurrent()) return false;
      noteManualExpenseSaved();
      void workflow.load();
      return true;
    },
    async deleteExpense() {
      if (!spaceId || !canEdit || !expense || deleting) return false;
      setDeleting(true);
      setDeleteError(null);
      try {
        await api.deleteExpense(spaceId, expense.id, expense.revision);
        if (!authorized.isCurrent()) return false;
        noteManualExpenseSaved();
        return true;
      } catch (cause) {
        if (!authorized.isCurrent()) return false;
        const message =
          cause instanceof Error
            ? cause.message
            : "The Expense could not be deleted.";
        setDeleteError(message);
        if (cause instanceof ExpenseApiError && cause.code === "STALE_EDIT")
          void workflow.load();
        return false;
      } finally {
        setDeleting(false);
      }
    },
    retryCategories: categories.reload,
  };
}
