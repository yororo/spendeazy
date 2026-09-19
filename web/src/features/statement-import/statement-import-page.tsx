import { InfoIcon } from "lucide-react";

import {
  FeatureDataEmpty,
  FeatureDataError,
  FeatureDataLoading,
} from "@/components/app/feature-data-state";
import { ImportProgress } from "./import-progress";
import { ImportSuccess } from "./import-success";
import { ReviewStatement } from "./review-statement";
import { importFeatures } from "./statement-import-data";
import {
  useCommitStatementImportMutation,
  useRecentImportsQuery,
  useStatementImportCategoriesQuery,
  useStatementImportRulesQuery,
  useRememberCategoryRuleMutation,
} from "./statement-import-queries";
import type {
  CategorizedStatement,
} from "./statement-categorizer";
import { StatementDropZone } from "./statement-drop-zone";
import {
  CategorizeStatementAdapter,
} from "./statement-import-workflow-adapter";
import { useStatementImportWorkflow } from "./use-statement-import-workflow";

interface StatementImportPageProps {
  onViewTransactions: () => void;
}

function StatementImportPage({ onViewTransactions }: StatementImportPageProps) {
  const categoryOptionsQuery = useStatementImportCategoriesQuery();
  const categoryRulesQuery = useStatementImportRulesQuery();
  const recentImportsQuery = useRecentImportsQuery();
  const commitMutation = useCommitStatementImportMutation();
  const rememberCategoryRuleMutation = useRememberCategoryRuleMutation();

  const categoryCatalogForWorkflow = categoryOptionsQuery.data ?? [];
  const categoryOptionsForWorkflow = categoryCatalogForWorkflow
    .filter((category) => category.isActive)
    .map(({ value, label, color }) => ({ value, label, color }));
  const { workflow, state: workflowState } = useStatementImportWorkflow({
    categoryOptions: categoryOptionsForWorkflow,
    categoryLabels: categoryCatalogForWorkflow,
    onRememberCategoryRule: (input, existingRules) =>
      rememberCategoryRuleMutation.mutateAsync({ input, existingRules }),
    onCommitStatementImport: (file, statement, options) =>
      commitMutation.mutateAsync({ file, statement, ...options }),
  });

  function acceptCategorizedStatement(
    file: File,
    categorizedStatement: CategorizedStatement,
  ) {
    workflow.acceptPreparedStatement(
      file,
      categorizedStatement,
      categoryRules,
    );
  }

  function resetImport() {
    workflow.backToUpload();
  }

  const isLoading =
    categoryOptionsQuery.isPending ||
    categoryRulesQuery.isPending ||
    recentImportsQuery.isPending;
  if (isLoading) {
    return <FeatureDataLoading label="Loading Statement Import" />;
  }

  if (
    categoryOptionsQuery.isError ||
    categoryRulesQuery.isError ||
    recentImportsQuery.isError
  ) {
    const error =
      categoryOptionsQuery.error ??
      categoryRulesQuery.error ??
      recentImportsQuery.error;
    return (
      <FeatureDataError
        message={error?.message}
        onRetry={() => {
          void categoryOptionsQuery.refetch();
          void categoryRulesQuery.refetch();
          void recentImportsQuery.refetch();
        }}
      />
    );
  }

  const categoryCatalog = categoryCatalogForWorkflow;
  const categoryOptions = categoryOptionsForWorkflow;
  const categoryRules = categoryRulesQuery.data;
  const recentImports = recentImportsQuery.data;
  const activeCategoryIds = new Set(
    categoryOptions.map((option) => option.value),
  );
  const activeCategoryRules = categoryRules.filter((rule) =>
    activeCategoryIds.has(rule.categoryId),
  );

  if (categoryOptions.length === 0) {
    return (
      <FeatureDataEmpty
        title="No active Categories configured"
        description="Create an active Category before starting Statement Import."
      />
    );
  }

  if (workflowState.commit.result) {
    return (
      <ImportSuccess
        committedImport={workflowState.commit.result}
        onImportAnother={resetImport}
        onViewTransactions={onViewTransactions}
      />
    );
  }

  const { importedFile, statement, stage } = workflowState;
  const { commit } = workflowState;

  if (importedFile && statement && stage === "review") {
    return (
      <ReviewStatement
        categoryOptions={categoryOptions}
        fileName={importedFile.name}
        statementSummary={statement.summary}
        transactions={statement.transactions}
        commitError={commit.error}
        probableDuplicateConflict={commit.probableDuplicateConflict}
        canImportAnyway={commit.canImportAnyway}
        canConfirm={commit.canConfirm}
        isCommitting={commit.isCommitting}
        hasFileDuplicate={commit.hasFileDuplicate}
        onBack={() => workflow.backToCategorize(categoryRules)}
        onResolve={() => workflow.returnToCategorize(categoryRules)}
        onCommit={(acknowledgeProbableDuplicates) => {
          void workflow.confirmStatementImport(acknowledgeProbableDuplicates);
        }}
      />
    );
  }

  if (importedFile && statement && stage === "categorize") {
    return (
      <CategorizeStatementAdapter
        workflow={workflow}
        categoryOptions={categoryOptions}
        categoryLabels={categoryCatalog}
        currentCategoryRules={categoryRules}
        fileName={importedFile.name}
        statementSummary={statement.summary}
        onBack={resetImport}
        onReview={() => workflow.enterReview()}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:h-screen lg:min-h-0 lg:px-9 lg:py-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-label text-muted-foreground">Imports / Upload</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Upload your statement
          </h1>
        </div>
        <ImportProgress currentStep="Upload" />
      </header>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-6">
        <section
          className="flex min-h-0 flex-col"
          aria-label="Upload statement"
        >
          <StatementDropZone
            categoryRules={activeCategoryRules}
            activeCategoryIds={activeCategoryIds}
            onStatementCategorized={acceptCategorizedStatement}
          />
        </section>

        <aside
          className="flex min-h-0 flex-col gap-4 lg:gap-[18px]"
          aria-label="Import guidance"
        >
          <section
            className="border border-border p-4"
            aria-labelledby="features-heading"
          >
            <h2
              id="features-heading"
              className="font-mono text-sm font-bold uppercase"
            >
              Features
            </h2>
            <ul className="mt-4 space-y-4">
              {importFeatures.map((feature) => {
                const Icon = feature.icon;

                return (
                  <li key={feature.label} className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-content-center border border-border bg-muted">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 font-mono">
                      <h3 className="text-xs font-bold tracking-wide uppercase">
                        {feature.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            className="flex gap-3 border border-foreground bg-primary p-3.5 text-primary-foreground"
            aria-label="Import privacy"
          >
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-sm leading-5 font-semibold">
              PDF processed locally. Your PDF stays on this device. Reviewed
              statement details and Transactions are saved when you import.
            </p>
          </section>

          <section
            className="flex min-h-0 flex-1 flex-col border border-foreground"
            aria-labelledby="recent-imports-heading"
          >
            <div className="flex min-h-12 items-center border-b px-3.5">
              <h2
                id="recent-imports-heading"
                className="font-mono text-xs font-bold tracking-wide uppercase"
              >
                Recent imports
              </h2>
            </div>
            <ul className="grid flex-1 sm:grid-cols-3 lg:grid-cols-1">
              {recentImports.length === 0 && (
                <li className="flex min-h-20 items-center px-3.5 py-3 text-sm text-muted-foreground">
                  No recent Statement Imports.
                </li>
              )}
              {recentImports.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-20 flex-col justify-center border-b px-3.5 py-3 last:border-b-0 sm:border-r sm:last:border-r-0 lg:border-r-0"
                >
                  <p className="truncate font-mono text-xs font-semibold">
                    {item.fileName}
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-muted-foreground uppercase">
                    {item.transactionCount} Transactions ·{" "}
                    {[item.provider, item.accountType]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · {item.statementDate}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

export { StatementImportPage };
