import { useEffect, useState } from "react";

import { CategorizeStatement } from "./categorize-statement";
import type {
  CategoryCatalogOption,
  CategoryColorOption,
  CategoryRule,
  CategorySuggestionFetcher,
} from "./statement-import-service";
import type {
  StatementImportWorkflow,
  StatementImportWorkflowState,
} from "./statement-import-workflow";
import type { CategorizedStatement } from "./statement-categorizer";
import { useWorkflowState } from "./use-statement-import-workflow";

interface CategorizeStatementAdapterProps {
  readonly workflow: StatementImportWorkflow;
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly categoryLabels: readonly CategoryCatalogOption[];
  readonly currentCategoryRules: readonly CategoryRule[];
  readonly destinationLabel?: string;
  readonly spaceId?: string;
  readonly getCategorySuggestion?: CategorySuggestionFetcher;
  readonly fileName: string;
  readonly statementSummary: CategorizedStatement["summary"];
  readonly onBack: () => void;
  readonly onReview: () => void;
}

function CategorizeStatementAdapter({
  workflow,
  categoryOptions,
  categoryLabels,
  currentCategoryRules,
  destinationLabel,
  spaceId,
  getCategorySuggestion,
  fileName,
  statementSummary,
  onBack,
  onReview,
}: CategorizeStatementAdapterProps) {
  const state: StatementImportWorkflowState = useWorkflowState(workflow);
  const [sessionCategoryRules] = useState(currentCategoryRules);

  useEffect(() => {
    workflow.beginCategorizeSession(sessionCategoryRules);
    return () => {
      workflow.abandonCategorizeSession();
    };
  }, [sessionCategoryRules, workflow]);

  const statement = state.statement;
  if (!statement) return null;

  return (
    <CategorizeStatement
      categoryOptions={categoryOptions}
      categoryLabels={categoryLabels}
      categoryRules={state.categoryRules}
      destinationLabel={destinationLabel}
      spaceId={spaceId}
      getCategorySuggestion={getCategorySuggestion}
      fileName={fileName}
      statementSummary={statementSummary}
      transactions={statement.transactions}
      editor={state.editor}
      canReview={state.canEnterReview}
      onBeginEdit={(transactionId) => workflow.beginEdit(transactionId)}
      onCancelEdit={() => workflow.cancelEdit()}
      onChangeDraft={(draft) => workflow.changeDraft(draft)}
      onChangeDescription={(description) =>
        workflow.changeDescription(description)
      }
      onChangeRememberRule={(checked) =>
        workflow.changeRememberRule(checked)
      }
      onChangeRememberedMatchType={(matchType) =>
        workflow.changeRememberedMatchType(matchType)
      }
      onChangeRememberedPattern={(pattern) =>
        workflow.changeRememberedPattern(pattern)
      }
      onSaveEdit={async () => {
        const result = await workflow.saveEdit();
        return result === "saved"
          ? workflow.getSnapshot().statement?.transactions ?? null
          : null;
      }}
      onToggleTransactionExclusion={(transactionId) =>
        workflow.toggleTransactionExclusion(transactionId)
      }
      onBack={onBack}
      onReview={onReview}
    />
  );
}

export { CategorizeStatementAdapter };
