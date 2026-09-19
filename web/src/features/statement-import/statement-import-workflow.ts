import type {
  CategorizedStatement,
  CategorizedTransaction,
} from "./statement-categorizer";
import { ApiError } from "@/shared/api";
import {
  categorizeTransactions,
  type CategoryCatalogOption,
  type CategoryColorOption,
  type CategoryRule,
  type CommitStatementImportOptions,
  type CommittedStatementImport,
  type RememberCategoryRuleInput,
  type RememberCategoryRuleResult,
} from "./statement-import-service";
import {
  getProbableDuplicateConflict,
  type ProbableDuplicateConflict,
} from "./statement-import-errors";
import {
  applyManualTransactionEdit,
  cleanDescription,
  getCategoryLabel,
  isIncludedStatementTransaction,
  normalizeDescription,
  toDateInputValue,
} from "./statement-import-utils";

type ImportStage = "upload" | "categorize" | "review";

interface TransactionDraft {
  readonly date: string;
  readonly description: string;
  readonly amount: string;
  readonly category: string;
}

interface CategorizeEditorState {
  readonly editingId: string | null;
  readonly draft: TransactionDraft | null;
  readonly draftError: string | null;
  readonly rememberRule: boolean;
  readonly rememberedMatchType: CategoryRule["matchType"];
  readonly rememberedPattern: string;
  readonly isSaving: boolean;
}

interface StatementImportWorkflowState {
  readonly stage: ImportStage;
  readonly importedFile: File | null;
  readonly statement: CategorizedStatement | null;
  readonly categoryRules: readonly CategoryRule[];
  readonly editor: CategorizeEditorState;
  readonly canEnterReview: boolean;
  readonly commit: StatementImportCommitState;
}

interface StatementImportCommitState {
  readonly isCommitting: boolean;
  readonly result: CommittedStatementImport | null;
  readonly error: Error | null;
  readonly probableDuplicateConflict: ProbableDuplicateConflict | null;
  readonly hasFileDuplicate: boolean;
  readonly canConfirm: boolean;
  readonly canImportAnyway: boolean;
}

interface StatementImportWorkflowDependencies {
  readonly getCategoryOptions: () => readonly CategoryColorOption[];
  readonly getCategoryLabels: () => readonly CategoryCatalogOption[];
  readonly rememberCategoryRule: (
    input: RememberCategoryRuleInput,
    existingRules: readonly CategoryRule[],
  ) => Promise<RememberCategoryRuleResult>;
  readonly commitStatementImport: (
    file: File,
    statement: CategorizedStatement,
    options: CommitStatementImportOptions,
  ) => Promise<CommittedStatementImport>;
}

type SaveEditResult =
  | "saved"
  | "invalid"
  | "conflict"
  | "failed"
  | "ignored"
  | "abandoned";

type ConfirmStatementImportResult =
  | "committed"
  | "failed"
  | "ignored"
  | "abandoned";

type WorkflowListener = () => void;

const emptyEditor = (): CategorizeEditorState => ({
  editingId: null,
  draft: null,
  draftError: null,
  rememberRule: false,
  rememberedMatchType: "contains",
  rememberedPattern: "",
  isSaving: false,
});

const emptyCommit = (): StatementImportCommitState => ({
  isCommitting: false,
  result: null,
  error: null,
  probableDuplicateConflict: null,
  hasFileDuplicate: false,
  canConfirm: false,
  canImportAnyway: false,
});

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;

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
  conflict: Extract<RememberCategoryRuleResult, { status: "conflict" }>["conflict"],
  getCategoryLabel: (categoryId: string) => string,
) {
  if (!conflict.existingCategoryId) return conflict.message;

  return `${conflict.message} Existing Category: “${getCategoryLabel(conflict.existingCategoryId)}”.`;
}

function canEnterReview(
  statement: CategorizedStatement | null,
  editor: CategorizeEditorState,
) {
  if (!statement || editor.editingId !== null || editor.isSaving) return false;

  return !hasUnmappedTransactions(statement);
}

function hasUnmappedTransactions(statement: CategorizedStatement | null) {
  return Boolean(
    statement?.transactions.some(
      (transaction) =>
        isIncludedStatementTransaction(transaction) &&
        transaction.categoryId === null,
    ),
  );
}

function getCommitState(
  stage: ImportStage,
  importedFile: File | null,
  statement: CategorizedStatement | null,
  commit: Pick<
    StatementImportCommitState,
    "isCommitting" | "result" | "error"
  >,
  probableDuplicateAcknowledgementAttempted: boolean,
): StatementImportCommitState {
  const probableDuplicateConflict = getProbableDuplicateConflict(commit.error);
  const hasFileDuplicate =
    commit.error instanceof ApiError &&
    commit.error.code === "STATEMENT_IMPORT_FILE_ALREADY_EXISTS";
  const hasUnmapped = hasUnmappedTransactions(statement);
  const hasImportContext = Boolean(importedFile && statement);

  return {
    ...commit,
    probableDuplicateConflict,
    hasFileDuplicate,
    canConfirm:
      stage === "review" &&
      hasImportContext &&
      !hasUnmapped &&
      !commit.isCommitting &&
      !commit.result &&
      !probableDuplicateConflict &&
      !hasFileDuplicate,
    canImportAnyway:
      stage === "review" &&
      hasImportContext &&
      Boolean(probableDuplicateConflict) &&
      !probableDuplicateAcknowledgementAttempted &&
      !commit.isCommitting &&
      !commit.result &&
      !hasFileDuplicate,
  };
}

function toCommitError(error: unknown) {
  return error instanceof Error
    ? error
    : new Error("The Statement Import could not be saved.");
}

function cloneStatement(statement: CategorizedStatement): CategorizedStatement {
  return {
    ...statement,
    transactions: [...statement.transactions],
  };
}

class StatementImportWorkflow {
  private dependencies: StatementImportWorkflowDependencies;
  private state: StatementImportWorkflowState = {
    stage: "upload",
    importedFile: null,
    statement: null,
    categoryRules: [],
    editor: emptyEditor(),
    canEnterReview: false,
    commit: emptyCommit(),
  };
  private readonly listeners = new Set<WorkflowListener>();
  private statementLifetime = Symbol("statement-import");
  private categorizeSessionLifetime: symbol | null = null;
  private editLifetime: symbol | null = null;
  private persistenceLifetime: symbol | null = null;
  private commitLifetime: symbol | null = null;
  private probableDuplicateAcknowledgementAttempted = false;
  private hasCustomizedRememberedPattern = false;
  private destroyed = false;

  constructor(dependencies: StatementImportWorkflowDependencies) {
    this.dependencies = dependencies;
  }

  updateDependencies(dependencies: StatementImportWorkflowDependencies) {
    if (!this.destroyed) this.dependencies = dependencies;
  }

  activate() {
    if (!this.destroyed) return;

    this.destroyed = false;
    this.invalidateEdit();
    this.commitLifetime = null;
    this.updateState((current) => ({
      ...current,
      editor: emptyEditor(),
    }));
  }

  getSnapshot = () => this.state;

  subscribe(listener: WorkflowListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  acceptPreparedStatement(
    file: File,
    statement: CategorizedStatement,
    categoryRules: readonly CategoryRule[],
  ) {
    if (this.destroyed) return false;

    this.statementLifetime = Symbol("statement-import");
    this.categorizeSessionLifetime = Symbol("categorize-session");
    this.invalidateEdit();
    this.commitLifetime = null;
    this.probableDuplicateAcknowledgementAttempted = false;
    this.updateState((current) => ({
      ...current,
      stage: "categorize",
      importedFile: file,
      statement: cloneStatement(statement),
      categoryRules: [...categoryRules],
      editor: emptyEditor(),
      commit: emptyCommit(),
    }));
    return true;
  }

  beginCategorizeSession(categoryRules: readonly CategoryRule[]) {
    if (this.destroyed || !this.state.statement) return false;

    this.categorizeSessionLifetime = Symbol("categorize-session");
    this.invalidateEdit();
    this.updateState((current) => ({
      ...current,
      stage: "categorize",
      categoryRules: [...categoryRules],
      editor: emptyEditor(),
    }));
    return true;
  }

  abandonCategorizeSession() {
    if (this.destroyed) return false;

    this.categorizeSessionLifetime = null;
    this.invalidateEdit();
    this.updateState((current) => ({
      ...current,
      editor: emptyEditor(),
    }));
    return true;
  }

  backToUpload() {
    if (this.destroyed) return false;

    this.statementLifetime = Symbol("statement-import");
    this.categorizeSessionLifetime = null;
    this.invalidateEdit();
    this.commitLifetime = null;
    this.probableDuplicateAcknowledgementAttempted = false;
    this.updateState((current) => ({
      ...current,
      stage: "upload",
      importedFile: null,
      statement: null,
      categoryRules: [],
      editor: emptyEditor(),
      commit: emptyCommit(),
    }));
    return true;
  }

  enterReview() {
    if (this.destroyed || !canEnterReview(this.state.statement, this.state.editor)) {
      return false;
    }

    this.categorizeSessionLifetime = null;
    this.updateState((current) => ({
      ...current,
      stage: "review",
    }));
    return true;
  }

  returnToCategorize(categoryRules: readonly CategoryRule[]) {
    if (this.destroyed || !this.state.statement) return false;

    return this.transitionToCategorize(categoryRules, false);
  }

  backToCategorize(categoryRules: readonly CategoryRule[]) {
    if (this.destroyed || !this.state.statement) return false;

    return this.transitionToCategorize(categoryRules, true);
  }

  async confirmStatementImport(
    acknowledgeProbableDuplicates: boolean,
  ): Promise<ConfirmStatementImportResult> {
    const { importedFile, statement, commit } = this.state;
    if (this.destroyed || !importedFile || !statement) return "ignored";

    const canStart = acknowledgeProbableDuplicates
      ? commit.canImportAnyway
      : commit.canConfirm;
    if (!canStart) return "ignored";

    const statementLifetime = this.statementLifetime;
    const commitLifetime = Symbol("commit-request");
    this.commitLifetime = commitLifetime;
    if (acknowledgeProbableDuplicates) {
      this.probableDuplicateAcknowledgementAttempted = true;
    }

    this.updateState((current) => ({
      ...current,
      commit: {
        ...current.commit,
        isCommitting: true,
        error: null,
        result: null,
      },
    }));

    try {
      const result = await this.dependencies.commitStatementImport(
        importedFile,
        statement,
        { acknowledgeProbableDuplicates },
      );

      if (!this.isCurrentCommit(statementLifetime, commitLifetime)) {
        return "abandoned";
      }

      this.commitLifetime = null;
      this.updateState((current) => ({
        ...current,
        commit: {
          ...current.commit,
          isCommitting: false,
          error: null,
          result,
        },
      }));
      return "committed";
    } catch (error) {
      if (!this.isCurrentCommit(statementLifetime, commitLifetime)) {
        return "abandoned";
      }

      this.commitLifetime = null;
      this.updateState((current) => ({
        ...current,
        commit: {
          ...current.commit,
          isCommitting: false,
          error: toCommitError(error),
          result: null,
        },
      }));
      return "failed";
    }
  }

  beginEdit(transactionId: string) {
    if (
      this.destroyed ||
      this.state.stage !== "categorize" ||
      this.state.editor.isSaving ||
      this.state.editor.editingId !== null
    ) {
      return false;
    }

    const transaction = this.state.statement?.transactions.find(
      (candidate) => candidate.id === transactionId,
    );
    if (!transaction || transaction.isExcluded) return false;

    this.editLifetime = Symbol("categorize-edit");
    this.hasCustomizedRememberedPattern = false;
    this.updateState((current) => ({
      ...current,
      editor: {
        editingId: transaction.id,
        draft: {
          date: toDateInputValue(transaction.transactionDate),
          description: transaction.description,
          amount: String(transaction.amount),
          category: transaction.categoryId ?? "",
        },
        draftError: null,
        rememberRule: false,
        rememberedMatchType: "contains",
        rememberedPattern: cleanDescription(transaction.description),
        isSaving: false,
      },
    }));
    return true;
  }

  cancelEdit() {
    if (this.destroyed || this.state.editor.isSaving || !this.state.editor.editingId) {
      return false;
    }

    this.invalidateEdit();
    this.updateState((current) => ({
      ...current,
      editor: emptyEditor(),
    }));
    return true;
  }

  changeDraft(draft: TransactionDraft) {
    if (this.destroyed || this.state.editor.isSaving || !this.state.editor.draft) {
      return false;
    }

    this.updateState((current) => ({
      ...current,
      editor: {
        ...current.editor,
        draft,
      },
    }));
    return true;
  }

  changeDescription(description: string) {
    if (this.destroyed || this.state.editor.isSaving || !this.state.editor.draft) {
      return false;
    }

    this.updateState((current) => {
      const draft = current.editor.draft;
      if (!draft) return current;

      const rememberedPattern =
        current.editor.rememberedMatchType === "exact"
          ? description
          : this.hasCustomizedRememberedPattern
            ? current.editor.rememberedPattern
            : cleanDescription(description);

      return {
        ...current,
        editor: {
          ...current.editor,
          draft: { ...draft, description },
          rememberedPattern,
          draftError: null,
        },
      };
    });
    return true;
  }

  changeRememberRule(checked: boolean) {
    if (this.destroyed || this.state.editor.isSaving || !this.state.editor.draft) {
      return false;
    }

    this.updateState((current) => ({
      ...current,
      editor: { ...current.editor, rememberRule: checked },
    }));
    return true;
  }

  changeRememberedMatchType(matchType: CategoryRule["matchType"]) {
    if (this.destroyed || this.state.editor.isSaving || !this.state.editor.draft) {
      return false;
    }

    this.updateState((current) => ({
      ...current,
      editor: {
        ...current.editor,
        rememberedMatchType: matchType,
        rememberedPattern:
          matchType === "exact"
            ? (current.editor.draft?.description ?? "")
            : current.editor.rememberedPattern,
        draftError: null,
      },
    }));
    if (matchType === "exact") this.hasCustomizedRememberedPattern = false;
    return true;
  }

  changeRememberedPattern(pattern: string) {
    if (this.destroyed || this.state.editor.isSaving || !this.state.editor.draft) {
      return false;
    }

    this.hasCustomizedRememberedPattern = true;
    this.updateState((current) => ({
      ...current,
      editor: {
        ...current.editor,
        rememberedPattern: pattern,
        draftError: null,
      },
    }));
    return true;
  }

  async saveEdit(): Promise<SaveEditResult> {
    const editingLifetime = this.editLifetime;
    const statementLifetime = this.statementLifetime;
    const categorizeSessionLifetime = this.categorizeSessionLifetime;
    const { editingId, draft } = this.state.editor;
    if (
      this.destroyed ||
      this.state.editor.isSaving ||
      !editingLifetime ||
      !categorizeSessionLifetime ||
      !editingId ||
      !draft ||
      !this.state.statement
    ) {
      return "ignored";
    }

    const nextError = validateDraft(draft);
    if (nextError) {
      this.setDraftError(nextError);
      return "invalid";
    }

    const selectedCategory = draft.category;
    const updatedFields = {
      transactionDate: new Date(`${draft.date}T00:00:00Z`),
      description: cleanDescription(draft.description),
      amount: Number(draft.amount),
    };
    const shouldRememberRule = this.state.editor.rememberRule;
    const normalizedPattern = normalizeDescription(
      this.state.editor.rememberedPattern,
    );
    if (shouldRememberRule && !normalizedPattern) {
      this.setDraftError("A Category Rule requires a non-empty pattern.");
      return "invalid";
    }

    this.updateState((current) => ({
      ...current,
      editor: { ...current.editor, isSaving: true },
    }));

    let nextCategoryRules = this.state.categoryRules;
    const persistenceLifetime = shouldRememberRule
      ? Symbol("persistence-request")
      : null;
    if (persistenceLifetime) {
      this.persistenceLifetime = persistenceLifetime;
      let ruleResult: RememberCategoryRuleResult;
      try {
        ruleResult = await this.dependencies.rememberCategoryRule(
          {
            pattern: normalizedPattern,
            categoryId: selectedCategory,
            matchType: this.state.editor.rememberedMatchType,
          },
          this.state.categoryRules,
        );
      } catch (error) {
        if (
          !this.isCurrentSave(
            statementLifetime,
            categorizeSessionLifetime,
            editingLifetime,
            persistenceLifetime,
          )
        ) {
          return "abandoned";
        }

        this.releaseSaveWithError(
          error instanceof Error
            ? error.message
            : "The Category Rule could not be saved.",
        );
        return "failed";
      }

      if (
        !this.isCurrentSave(
          statementLifetime,
          categorizeSessionLifetime,
          editingLifetime,
          persistenceLifetime,
        )
      ) {
        return "abandoned";
      }

      if (ruleResult.status === "conflict") {
        this.releaseSaveWithError(
          formatCategoryRuleConflict(
            ruleResult.conflict,
            (categoryId) =>
              getCategoryLabel(this.dependencies.getCategoryLabels(), categoryId),
          ),
        );
        return "conflict";
      }

      nextCategoryRules = this.state.categoryRules.some(
        (rule) => rule.id === ruleResult.rule.id,
      )
        ? this.state.categoryRules
        : [...this.state.categoryRules, ruleResult.rule];
    }

    if (
      persistenceLifetime &&
      !this.isCurrentSave(
        statementLifetime,
        categorizeSessionLifetime,
        editingLifetime,
        persistenceLifetime,
      )
    ) {
      return "abandoned";
    }

    const currentStatement = this.state.statement;
    if (!currentStatement) return "abandoned";

    const transactions = this.applyEdit(
      currentStatement.transactions,
      editingId,
      updatedFields,
      selectedCategory,
      shouldRememberRule,
      nextCategoryRules,
    );

    this.invalidateEdit();
    this.updateState((current) => ({
      ...current,
      statement: { ...currentStatement, transactions },
      categoryRules: nextCategoryRules,
      editor: emptyEditor(),
    }));
    return "saved";
  }

  toggleTransactionExclusion(transactionId: string) {
    if (this.destroyed || this.state.editor.isSaving) return false;

    const transaction = this.state.statement?.transactions.find(
      (candidate) => candidate.id === transactionId,
    );
    if (
      this.state.stage !== "categorize" ||
      !transaction ||
      transaction.amount > 0
    ) {
      return false;
    }

    this.updateState((current) => ({
      ...current,
      statement: current.statement
        ? {
            ...current.statement,
            transactions: current.statement.transactions.map((candidate) =>
              candidate.id === transactionId
                ? { ...candidate, isExcluded: !candidate.isExcluded }
                : candidate,
            ),
          }
        : null,
    }));
    return true;
  }

  destroy() {
    this.destroyed = true;
    this.categorizeSessionLifetime = null;
    this.commitLifetime = null;
    this.invalidateEdit();
    this.listeners.clear();
  }

  private transitionToCategorize(
    categoryRules: readonly CategoryRule[],
    resetCommit: boolean,
  ) {
    this.categorizeSessionLifetime = Symbol("categorize-session");
    this.invalidateEdit();
    if (resetCommit) {
      this.commitLifetime = null;
      this.probableDuplicateAcknowledgementAttempted = false;
    }

    this.updateState((current) => ({
      ...current,
      stage: "categorize",
      categoryRules: [...categoryRules],
      editor: emptyEditor(),
      commit: resetCommit ? emptyCommit() : current.commit,
    }));
    return true;
  }

  private applyEdit(
    transactions: readonly CategorizedTransaction[],
    transactionId: string,
    updatedFields: {
      readonly transactionDate: Date;
      readonly description: string;
      readonly amount: number;
    },
    categoryId: string,
    shouldRememberRule: boolean,
    categoryRules: readonly CategoryRule[],
  ) {
    const manuallyUpdatedTransactions = applyManualTransactionEdit(
      transactions,
      {
        transactionId,
        ...updatedFields,
        categoryId,
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
      this.dependencies
        .getCategoryOptions()
        .map((option) => option.value),
    );

    return manuallyUpdatedTransactions.map((transaction) => {
      if (transaction.id === transactionId) {
        return {
          ...transaction,
          matchedCategoryIds: [],
        };
      }

      if (
        !isIncludedStatementTransaction(transaction) ||
        transaction.assignment === "manual"
      ) {
        return transaction;
      }

      const categorization = categorizeTransactions(
        [transaction],
        categoryRules,
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
  }

  private setDraftError(draftError: string) {
    this.updateState((current) => ({
      ...current,
      editor: { ...current.editor, draftError },
    }));
  }

  private releaseSaveWithError(draftError: string) {
    this.persistenceLifetime = null;
    this.updateState((current) => ({
      ...current,
      editor: { ...current.editor, draftError, isSaving: false },
    }));
  }

  private invalidateEdit() {
    this.editLifetime = null;
    this.persistenceLifetime = null;
    this.hasCustomizedRememberedPattern = false;
  }

  private isCurrentSave(
    statementLifetime: symbol,
    categorizeSessionLifetime: symbol,
    editLifetime: symbol,
    persistenceLifetime: symbol,
  ) {
    return (
      !this.destroyed &&
      this.statementLifetime === statementLifetime &&
      this.categorizeSessionLifetime === categorizeSessionLifetime &&
      this.editLifetime === editLifetime &&
      this.persistenceLifetime === persistenceLifetime
    );
  }

  private isCurrentCommit(
    statementLifetime: symbol,
    commitLifetime: symbol,
  ) {
    return (
      !this.destroyed &&
      this.statementLifetime === statementLifetime &&
      this.commitLifetime === commitLifetime
    );
  }

  private updateState(
    update: (
      current: StatementImportWorkflowState,
    ) => StatementImportWorkflowState,
  ) {
    if (this.destroyed) return;

    const next = update(this.state);
    this.state = {
      ...next,
      canEnterReview: canEnterReview(next.statement, next.editor),
      commit: getCommitState(
        next.stage,
        next.importedFile,
        next.statement,
        next.commit,
        this.probableDuplicateAcknowledgementAttempted,
      ),
    };
    this.listeners.forEach((listener) => listener());
  }
}

function createStatementImportWorkflow(
  dependencies: StatementImportWorkflowDependencies,
) {
  return new StatementImportWorkflow(dependencies);
}

export { createStatementImportWorkflow };
export type {
  CategorizeEditorState,
  ImportStage,
  SaveEditResult,
  ConfirmStatementImportResult,
  StatementImportCommitState,
  StatementImportWorkflow,
  StatementImportWorkflowDependencies,
  StatementImportWorkflowState,
  TransactionDraft,
};
