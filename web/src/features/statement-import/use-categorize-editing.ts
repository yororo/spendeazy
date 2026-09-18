import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  categorizeTransactions,
  type CategoryColorOption,
  type CategoryRule,
  type CategoryRuleConflict,
  type CategoryCatalogOption,
  type RememberCategoryRuleInput,
  type RememberCategoryRuleResult,
} from "./statement-import-service";
import {
  applyManualTransactionEdit,
  cleanDescription,
  isIncludedStatementTransaction,
  normalizeDescription,
  toDateInputValue,
} from "./statement-import-utils";
import type { CategorizedTransaction } from "./statement-categorizer";

const MOBILE_EDITOR_BREAKPOINT_PX = 768;

interface TransactionDraft {
  readonly date: string;
  readonly description: string;
  readonly amount: string;
  readonly category: string;
}

interface UseCategorizeEditingOptions {
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly categoryLabels: readonly CategoryCatalogOption[];
  readonly initialCategoryRules: readonly CategoryRule[];
  readonly transactions: CategorizedTransaction[];
  readonly onRememberCategoryRule: (
    input: RememberCategoryRuleInput,
    existingRules: readonly CategoryRule[],
  ) => Promise<RememberCategoryRuleResult>;
  readonly onTransactionsChange: Dispatch<
    SetStateAction<CategorizedTransaction[]>
  >;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validateDraft(draft: TransactionDraft) {
  if (!draft.description.trim()) return "Description is required.";
  if (!isValidDate(draft.date)) return "Choose a valid transaction date.";

  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return "Amount must be a non-zero number.";
  }
  if (!draft.category) return "Choose a Category for this Transaction.";

  return null;
}

function formatCategoryRuleConflict(
  conflict: CategoryRuleConflict,
  getCategoryLabel: (categoryId: string) => string,
) {
  if (!conflict.existingCategoryId) return conflict.message;

  return `${conflict.message} Existing Category: “${getCategoryLabel(conflict.existingCategoryId)}”.`;
}

function useCategorizeEditing({
  categoryOptions,
  categoryLabels,
  initialCategoryRules,
  transactions,
  onRememberCategoryRule,
  onTransactionsChange,
}: UseCategorizeEditingOptions) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TransactionDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [rememberRule, setRememberRule] = useState(false);
  const [rememberedMatchType, setRememberedMatchType] =
    useState<CategoryRule["matchType"]>("contains");
  const [rememberedPattern, setRememberedPattern] = useState("");
  const [hasCustomizedRememberedPattern, setHasCustomizedRememberedPattern] =
    useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [categoryRules, setCategoryRules] =
    useState<readonly CategoryRule[]>(initialCategoryRules);
  const [isSaving, setIsSaving] = useState(false);
  const saveInProgressRef = useRef(false);
  const editingLifetimeRef = useRef<symbol | null>(null);

  const isEditing = editingId !== null;
  const editingTransaction = transactions.find(
    (transaction) => transaction.id === editingId,
  );

  useEffect(() => {
    if (!isEditing) return;

    function syncEditorForViewport() {
      setMobileEditorOpen(window.innerWidth < MOBILE_EDITOR_BREAKPOINT_PX);
    }

    window.addEventListener("resize", syncEditorForViewport);
    return () => window.removeEventListener("resize", syncEditorForViewport);
  }, [isEditing]);

  useLayoutEffect(
    () => () => {
      editingLifetimeRef.current = null;
      saveInProgressRef.current = false;
    },
    [],
  );

  function getCategoryLabel(categoryId: string) {
    return (
      categoryLabels.find((option) => option.value === categoryId)?.label ??
      "Unknown Category"
    );
  }

  function clearEditingState() {
    setEditingId(null);
    setDraft(null);
    setDraftError(null);
    setRememberRule(false);
    setRememberedMatchType("contains");
    setRememberedPattern("");
    setHasCustomizedRememberedPattern(false);
    setMobileEditorOpen(false);
  }

  function startEditing(
    transaction: CategorizedTransaction,
    openMobileEditor: boolean,
  ) {
    if (saveInProgressRef.current || editingId !== null) return;

    editingLifetimeRef.current = Symbol("categorize-edit");
    setEditingId(transaction.id);
    setDraft({
      date: toDateInputValue(transaction.transactionDate),
      description: transaction.description,
      amount: String(transaction.amount),
      category: transaction.categoryId ?? "",
    });
    setDraftError(null);
    setRememberRule(false);
    setRememberedMatchType("contains");
    setRememberedPattern(cleanDescription(transaction.description));
    setHasCustomizedRememberedPattern(false);
    setMobileEditorOpen(openMobileEditor);
  }

  function beginEditing(transaction: CategorizedTransaction) {
    startEditing(transaction, false);
  }

  function beginMobileEditing(transaction: CategorizedTransaction) {
    startEditing(transaction, true);
  }

  function cancelEditing() {
    if (saveInProgressRef.current) return;
    editingLifetimeRef.current = null;
    clearEditingState();
  }

  function abandonEditing() {
    editingLifetimeRef.current = null;
    saveInProgressRef.current = false;
    clearEditingState();
    setIsSaving(false);
  }

  function closeMobileEditor() {
    cancelEditing();
  }

  function updateDraft(nextDraft: TransactionDraft) {
    if (saveInProgressRef.current) return;
    setDraft(nextDraft);
  }

  function updateDraftDescription(description: string) {
    if (saveInProgressRef.current) return;
    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            description,
          }
        : currentDraft,
    );
    if (rememberedMatchType === "exact") {
      setRememberedPattern(description);
    } else if (!hasCustomizedRememberedPattern) {
      setRememberedPattern(cleanDescription(description));
    }
    setDraftError(null);
  }

  function updateRememberRule(checked: boolean) {
    if (saveInProgressRef.current) return;
    setRememberRule(checked);
  }

  function updateRememberedMatchType(matchType: CategoryRule["matchType"]) {
    if (saveInProgressRef.current) return;
    setRememberedMatchType(matchType);
    if (matchType === "exact" && draft) {
      setRememberedPattern(draft.description);
      setHasCustomizedRememberedPattern(false);
    }
    setDraftError(null);
  }

  function updateRememberedPattern(pattern: string) {
    if (saveInProgressRef.current) return;
    setRememberedPattern(pattern);
    setHasCustomizedRememberedPattern(true);
    setDraftError(null);
  }

  async function saveEditing() {
    const editingLifetime = editingLifetimeRef.current;
    if (
      saveInProgressRef.current ||
      !editingLifetime ||
      !editingId ||
      !draft
    ) {
      return false;
    }

    const nextError = validateDraft(draft);
    if (nextError) {
      setDraftError(nextError);
      return false;
    }

    const transactionId = editingId;
    const submittedDraft = draft;
    const selectedCategory = submittedDraft.category;
    const updatedFields = {
      transactionDate: new Date(`${submittedDraft.date}T00:00:00Z`),
      description: cleanDescription(submittedDraft.description),
      amount: Number(submittedDraft.amount),
    };
    const shouldRememberRule = rememberRule;
    const normalizedPattern = normalizeDescription(rememberedPattern);
    if (shouldRememberRule && !normalizedPattern) {
      setDraftError("A Category Rule requires a non-empty pattern.");
      return false;
    }

    let nextCategoryRules = categoryRules;

    if (shouldRememberRule) {
      saveInProgressRef.current = true;
      setIsSaving(true);

      let ruleResult: RememberCategoryRuleResult;
      try {
        ruleResult = await onRememberCategoryRule(
          {
            pattern: normalizedPattern,
            categoryId: selectedCategory,
            matchType: rememberedMatchType,
          },
          categoryRules,
        );
      } catch (error) {
        if (editingLifetimeRef.current !== editingLifetime) return false;

        setDraftError(
          error instanceof Error
            ? error.message
            : "The Category Rule could not be saved.",
        );
        saveInProgressRef.current = false;
        setIsSaving(false);
        return false;
      }

      if (editingLifetimeRef.current !== editingLifetime) return false;

      if (ruleResult.status === "conflict") {
        setDraftError(
          formatCategoryRuleConflict(ruleResult.conflict, getCategoryLabel),
        );
        saveInProgressRef.current = false;
        setIsSaving(false);
        return false;
      }

      nextCategoryRules = categoryRules.some(
        (rule) => rule.id === ruleResult.rule.id,
      )
        ? categoryRules
        : [...categoryRules, ruleResult.rule];
      setCategoryRules(nextCategoryRules);
    }

    onTransactionsChange((currentTransactions) => {
      const manuallyUpdatedTransactions = applyManualTransactionEdit(
        currentTransactions,
        {
          transactionId,
          ...updatedFields,
          categoryId: selectedCategory,
        },
      );

      if (!shouldRememberRule) {
        return manuallyUpdatedTransactions.map((transaction) =>
          transaction.id === transactionId
            ? { ...transaction, matchedCategoryIds: [] }
            : transaction,
        );
      }

      const activeCategoryIds = new Set(
        categoryOptions.map((option) => option.value),
      );

      return manuallyUpdatedTransactions.map((transaction) => {
        if (transaction.id === transactionId) {
          return {
            ...transaction,
            matchedCategoryIds: [],
          };
        }

        if (!isIncludedStatementTransaction(transaction)) {
          return transaction;
        }

        if (transaction.assignment === "manual") {
          return transaction;
        }

        const categorization = categorizeTransactions(
          [transaction],
          nextCategoryRules,
          activeCategoryIds,
        )[0];
        if (!categorization) return transaction;

        return {
          ...transaction,
          categoryId: categorization.categoryId,
          assignment: categorization.assignment,
          matchedCategoryIds: categorization.matchedCategoryIds ?? [],
        };
      });
    });

    clearEditingState();
    saveInProgressRef.current = false;
    setIsSaving(false);
    return true;
  }

  function toggleTransactionExclusion(transaction: CategorizedTransaction) {
    if (saveInProgressRef.current || transaction.amount > 0) return;

    onTransactionsChange((currentTransactions) =>
      currentTransactions.map((currentTransaction) =>
        currentTransaction.id === transaction.id
          ? {
              ...currentTransaction,
              isExcluded: !currentTransaction.isExcluded,
            }
          : currentTransaction,
      ),
    );
  }

  return {
    beginEditing,
    beginMobileEditing,
    abandonEditing,
    cancelEditing,
    categoryRules,
    closeMobileEditor,
    draft,
    draftError,
    editingId,
    editingTransaction,
    getCategoryLabel,
    isEditing,
    isSaving,
    mobileEditorOpen,
    rememberedMatchType,
    rememberedPattern,
    rememberRule,
    saveEditing,
    toggleTransactionExclusion,
    updateDraft,
    updateDraftDescription,
    updateRememberRule,
    updateRememberedMatchType,
    updateRememberedPattern,
  };
}

export { useCategorizeEditing };
export type { TransactionDraft };
