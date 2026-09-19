import { useEffect, useState, useSyncExternalStore } from "react";

import type {
  CategoryCatalogOption,
  CategoryColorOption,
  CategoryRule,
  RememberCategoryRuleInput,
  RememberCategoryRuleResult,
} from "./statement-import-service";
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
}: UseStatementImportWorkflowOptions) {
  const [workflow] = useState(() =>
    createStatementImportWorkflow({
      getCategoryOptions: () => categoryOptions,
      getCategoryLabels: () => categoryLabels,
      rememberCategoryRule: (input, existingRules) =>
        onRememberCategoryRule(input, existingRules),
    }),
  );

  useEffect(() => {
    const dependencies: StatementImportWorkflowDependencies = {
      getCategoryOptions: () => categoryOptions,
      getCategoryLabels: () => categoryLabels,
      rememberCategoryRule: (input, existingRules) =>
        onRememberCategoryRule(input, existingRules),
    };
    workflow.updateDependencies(dependencies);
  }, [categoryLabels, categoryOptions, onRememberCategoryRule, workflow]);

  const state = useWorkflowState(workflow);
  return { workflow, state };
}

export { useStatementImportWorkflow, useWorkflowState };
