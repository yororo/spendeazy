import { useEffect, useState, useSyncExternalStore } from "react";

import type {
  CategoryCatalogOption,
  CategoryColorOption,
  CategoryRule,
  CommitStatementImportOptions,
  CommittedStatementImport,
  RememberCategoryRuleInput,
  RememberCategoryRuleResult,
} from "./statement-import-service";
import type { CategorizedStatement } from "./statement-categorizer";
import {
  createStatementImportWorkflow,
  type StatementImportWorkflow,
  type StatementImportWorkflowDependencies,
} from "./statement-import-workflow";

interface UseStatementImportWorkflowOptions {
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly categoryLabels: readonly CategoryCatalogOption[];
  readonly onRememberCategoryRule: (
    input: RememberCategoryRuleInput,
    existingRules: readonly CategoryRule[],
  ) => Promise<RememberCategoryRuleResult>;
  readonly onCommitStatementImport: (
    file: File,
    statement: CategorizedStatement,
    options: CommitStatementImportOptions,
  ) => Promise<CommittedStatementImport>;
}

function useWorkflowState(workflow: StatementImportWorkflow) {
  return useSyncExternalStore(
    (listener) => workflow.subscribe(listener),
    workflow.getSnapshot,
    workflow.getSnapshot,
  );
}

function useStatementImportWorkflow({
  categoryOptions,
  categoryLabels,
  onRememberCategoryRule,
  onCommitStatementImport,
}: UseStatementImportWorkflowOptions) {
  const [workflow] = useState(() =>
    createStatementImportWorkflow({
      getCategoryOptions: () => categoryOptions,
      getCategoryLabels: () => categoryLabels,
      rememberCategoryRule: (input, existingRules) =>
        onRememberCategoryRule(input, existingRules),
      commitStatementImport: (file, statement, options) =>
        onCommitStatementImport(file, statement, options),
    }),
  );

  useEffect(() => {
    workflow.activate();
    const dependencies: StatementImportWorkflowDependencies = {
      getCategoryOptions: () => categoryOptions,
      getCategoryLabels: () => categoryLabels,
      rememberCategoryRule: (input, existingRules) =>
        onRememberCategoryRule(input, existingRules),
      commitStatementImport: (file, statement, options) =>
        onCommitStatementImport(file, statement, options),
    };
    workflow.updateDependencies(dependencies);
  }, [
    categoryLabels,
    categoryOptions,
    onCommitStatementImport,
    onRememberCategoryRule,
    workflow,
  ]);

  const state = useWorkflowState(workflow);

  useEffect(() => {
    return () => workflow.destroy();
  }, [workflow]);

  return { workflow, state };
}

export { useStatementImportWorkflow, useWorkflowState };
