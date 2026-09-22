import { InfoIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  FeatureDataEmpty,
  FeatureDataError,
  FeatureDataLoading,
} from "@/components/app/feature-data-state";
import { useAccessibleSpacesQuery, type AccessibleSpace } from "@/shared/api";
import { ActiveSpaceLabel, getSpaceIdentityLabel } from "@/shared/ui";
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
import { useStatementImportNavigationGuard } from "./statement-import-navigation-guard";
import { useStatementImportWorkflow } from "./use-statement-import-workflow";

interface StatementImportPageProps {
  onViewTransactions: (spaceId?: string) => void;
  spaceId?: string;
  onSpaceChange?: (spaceId?: string) => void;
}

function StatementImportPage({
  onViewTransactions,
  spaceId,
  onSpaceChange,
}: StatementImportPageProps) {
  const shouldResolvePersonalSpace = onSpaceChange !== undefined;
  const spacesQuery = useAccessibleSpacesQuery(shouldResolvePersonalSpace);
  const effectiveSpaceId =
    spaceId ?? spacesQuery.data?.find((space) => space.kind === "personal")?.id;
  const [importDestination, setImportDestination] = useState<{
    readonly spaceId?: string;
  } | null>(null);
  const destinationSpaceId = importDestination
    ? importDestination.spaceId
    : effectiveSpaceId;
  const scopeReady =
    !shouldResolvePersonalSpace || spacesQuery.isSuccess;
  const categoryOptionsQuery = useStatementImportCategoriesQuery(
    destinationSpaceId,
    scopeReady,
  );
  const categoryRulesQuery = useStatementImportRulesQuery(
    destinationSpaceId,
    scopeReady,
  );
  const recentImportsQuery = useRecentImportsQuery(
    destinationSpaceId,
    scopeReady,
  );
  const commitMutation = useCommitStatementImportMutation();
  const rememberCategoryRuleMutation = useRememberCategoryRuleMutation();
  const destinationLabel = getDestinationLabel(
    destinationSpaceId,
    spacesQuery.data,
  );
  const destinationSpace = spacesQuery.data?.find(
    (space) => space.id === destinationSpaceId,
  );

  const categoryCatalogForWorkflow = categoryOptionsQuery.data ?? [];
  const categoryOptionsForWorkflow = categoryCatalogForWorkflow
    .filter((category) => category.isActive)
    .map(({ value, label, color }) => ({ value, label, color }));
  const { workflow, state: workflowState } = useStatementImportWorkflow({
    categoryOptions: categoryOptionsForWorkflow,
    categoryLabels: categoryCatalogForWorkflow,
    onRememberCategoryRule: (input, existingRules) =>
      rememberCategoryRuleMutation.mutateAsync({
        input,
        existingRules,
        spaceId: destinationSpaceId,
      }),
    onCommitStatementImport: (file, statement, options) =>
      commitMutation.mutateAsync({
        file,
        statement,
        ...options,
        spaceId: destinationSpaceId,
      }),
  });
  const hasGuardedImport =
    workflowState.stage !== "upload" &&
    workflowState.commit.result === null &&
    Boolean(workflowState.importedFile && workflowState.statement);
  const guardStage = workflowState.stage === "review" ? "review" : "categorize";
  const { dialog: navigationGuardDialog, requestExit } =
    useStatementImportNavigationGuard({
      enabled: hasGuardedImport,
      guardKey: workflowState.importedFile,
      stage: guardStage,
      onDiscard: resetImport,
    });

  function withNavigationGuard(content: ReactNode) {
    return (
      <>
        {navigationGuardDialog}
        {content}
      </>
    );
  }

  function acceptCategorizedStatement(
    file: File,
    categorizedStatement: CategorizedStatement,
  ) {
    setImportDestination({ spaceId: effectiveSpaceId });
    workflow.acceptPreparedStatement(
      file,
      categorizedStatement,
      categoryRules,
    );
  }

  function resetImport() {
    setImportDestination(null);
    workflow.backToUpload();
  }

  const isLoading =
    (shouldResolvePersonalSpace && spacesQuery.isPending) ||
    categoryOptionsQuery.isPending ||
    categoryRulesQuery.isPending ||
    recentImportsQuery.isPending;
  if (shouldResolvePersonalSpace && spacesQuery.isError) {
    return withNavigationGuard(
      <FeatureDataError
        message={spacesQuery.error?.message}
        onRetry={() => {
          void spacesQuery.refetch();
        }}
      />,
    );
  }
  if (shouldResolvePersonalSpace && spacesQuery.isSuccess && !effectiveSpaceId) {
    return withNavigationGuard(
      <FeatureDataError message="Personal Space is unavailable." onRetry={() => void spacesQuery.refetch()} />,
    );
  }
  if (isLoading) {
    return withNavigationGuard(
      <FeatureDataLoading label="Loading Statement Import" />,
    );
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
    return withNavigationGuard(
      <FeatureDataError
        message={error?.message}
        onRetry={() => {
          void categoryOptionsQuery.refetch();
          void categoryRulesQuery.refetch();
          void recentImportsQuery.refetch();
        }}
      />,
    );
  }

  const categoryCatalog = categoryCatalogForWorkflow;
  const categoryOptions = categoryOptionsForWorkflow;
  const categoryRules = categoryRulesQuery.data;
  const recentImports = recentImportsQuery.data;
  if (getUnknownSharedImporter(recentImports, destinationSpace)) {
    return withNavigationGuard(
      <FeatureDataError
        message="The API returned an unknown Statement Import importer."
        onRetry={() => {
          void spacesQuery.refetch();
          void recentImportsQuery.refetch();
        }}
      />,
    );
  }
  const activeCategoryIds = new Set(
    categoryOptions.map((option) => option.value),
  );
  const activeCategoryRules = categoryRules.filter((rule) =>
    activeCategoryIds.has(rule.categoryId),
  );

  if (categoryOptions.length === 0) {
    return withNavigationGuard(
      <FeatureDataEmpty
        title="No active Categories configured"
        description="Create an active Category before starting Statement Import."
      />,
    );
  }

  if (workflowState.commit.result) {
    const importerName = getSharedImporterName(
      workflowState.commit.result.importedByUserId,
      destinationSpace,
    );
    if (destinationSpace?.kind === "shared" && importerName === undefined) {
      return withNavigationGuard(
        <FeatureDataError
          message="The API returned an unknown Statement Import importer."
          onRetry={() => {
            void spacesQuery.refetch();
          }}
        />,
      );
    }

    return withNavigationGuard(
      <ImportSuccess
        committedImport={workflowState.commit.result}
        destinationLabel={destinationLabel}
        importerName={importerName}
        spaceId={destinationSpaceId}
        onImportAnother={resetImport}
        onViewTransactions={() => onViewTransactions(destinationSpaceId)}
      />,
    );
  }

  const { importedFile, statement, stage } = workflowState;
  const { commit } = workflowState;

  if (importedFile && statement && stage === "review") {
    return withNavigationGuard(
      <ReviewStatement
        categoryOptions={categoryOptions}
        destinationLabel={destinationLabel}
        spaceId={destinationSpaceId}
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
      />,
    );
  }

  if (importedFile && statement && stage === "categorize") {
    return withNavigationGuard(
      <CategorizeStatementAdapter
        workflow={workflow}
        categoryOptions={categoryOptions}
        categoryLabels={categoryCatalog}
        currentCategoryRules={categoryRules}
        destinationLabel={destinationLabel}
        spaceId={destinationSpaceId}
        fileName={importedFile.name}
        statementSummary={statement.summary}
        onBack={() => requestExit(resetImport)}
        onReview={() => workflow.enterReview()}
      />,
    );
  }

  return withNavigationGuard(
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:h-screen lg:min-h-0 lg:px-9 lg:py-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <ActiveSpaceLabel spaceId={spaceId} />
          <p className="text-label text-muted-foreground">Imports / Upload</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Upload your statement
          </h1>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-end">
          <ImportProgress currentStep="Upload" />
        </div>
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
                  {destinationSpace?.kind === "shared" && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      Imported by{" "}
                      {getSharedImporterName(
                        item.importedByUserId,
                        destinationSpace,
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>,
  );
}

export { StatementImportPage };

function getUnknownSharedImporter(
  imports: readonly { readonly importedByUserId: string }[],
  space: AccessibleSpace | undefined,
): string | undefined {
  if (space?.kind !== "shared") return undefined;

  return imports.find(
    (item) => getSharedImporterName(item.importedByUserId, space) === undefined,
  )?.importedByUserId;
}

function getSharedImporterName(
  importedByUserId: string,
  space: AccessibleSpace | undefined,
): string | undefined {
  if (space?.kind !== "shared") return undefined;

  return space.members.find((member) => member.id === importedByUserId)?.name;
}

function getDestinationLabel(
  spaceId: string | undefined,
  spaces: readonly AccessibleSpace[] | undefined,
): string {
  const space = spaces?.find((candidate) => candidate.id === spaceId);
  if (space) return getSpaceIdentityLabel(space, true);
  if (spaceId === undefined) {
    return "Personal Space";
  }

  return `Space ${spaceId}`;
}
