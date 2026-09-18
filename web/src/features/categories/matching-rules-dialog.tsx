import { useRef, useState, type FormEvent } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  ListFilterIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/shared/api";

import {
  useCategoryRulesQuery,
  useReplaceCategoryRulesMutation,
} from "./categories-queries";
import type { CategoryRuleInput, CategoryRule } from "./category-rules-service";
import {
  areCategoryRuleDraftsEqual,
  validateCategoryRuleDraft,
  type CategoryRuleDraft,
  type CategoryRuleValidationErrors,
} from "./matching-rules-form";
import type { CategoryOverviewItem } from "./categories-service";

interface MatchingRulesDialogProps {
  readonly allCategories: readonly CategoryOverviewItem[];
  readonly category: CategoryOverviewItem;
  readonly disabled?: boolean;
}

function createDraftRule(rule: CategoryRule): CategoryRuleDraft {
  return {
    clientId: `persisted-${rule.id}`,
    pattern: rule.pattern,
    matchType: rule.matchType,
  };
}

function createNewDraftRule(
  matchType: CategoryRuleDraft["matchType"],
  clientId: string,
): CategoryRuleDraft {
  return {
    clientId,
    pattern: "",
    matchType,
  };
}

function getSelectedRules(rules: readonly CategoryRule[], categoryId: string) {
  return rules
    .filter((rule) => rule.categoryId === categoryId)
    .map(createDraftRule);
}

function getSaveErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The Category Rules could not be saved.";

  if (!(error instanceof ApiError)) return message;

  const conflictingCategoryName = error.details
    .map((detail) =>
      [
        detail.categoryName,
        detail.conflictingCategoryName,
        detail.existingCategoryName,
      ].find(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    )
    .find((value): value is string => Boolean(value));

  return conflictingCategoryName && !message.includes(conflictingCategoryName)
    ? `${message} Conflicting Category: “${conflictingCategoryName}”.`
    : message;
}

function RuleSection({
  errors,
  matchType,
  onAdd,
  onChange,
  onRemove,
  rules,
}: {
  readonly errors: CategoryRuleValidationErrors;
  readonly matchType: CategoryRuleDraft["matchType"];
  readonly onAdd: () => void;
  readonly onChange: (clientId: string, pattern: string) => void;
  readonly onRemove: (clientId: string) => void;
  readonly rules: readonly CategoryRuleDraft[];
}) {
  const isExact = matchType === "exact";
  const title = isExact ? "Exact" : "Contains";
  const description = isExact
    ? "Description must exactly match one of these values. Exact rules are evaluated before Contains rules."
    : "Description contains one of these values, including within a word.";

  return (
    <section
      className="grid gap-3"
      aria-labelledby={`${matchType}-rules-heading`}
    >
      <header className="grid gap-1">
        <h3 id={`${matchType}-rules-heading`} className="text-label">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="grid gap-2">
        {rules.length === 0 ? (
          <p className="border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No {title} rules yet.
          </p>
        ) : (
          rules.map((rule, index) => {
            const errorId = `${rule.clientId}-error`;
            const error = errors[rule.clientId];

            return (
              <div key={rule.clientId} className="grid gap-1">
                <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] border border-border">
                  <span className="grid min-h-10 place-content-center border-r border-border bg-muted font-mono text-xs font-bold text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Input
                    value={rule.pattern}
                    maxLength={500}
                    aria-label={`${title} pattern ${index + 1}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="h-10 border-0 px-3 font-mono text-sm font-semibold focus-visible:relative focus-visible:z-10"
                    onChange={(event) =>
                      onChange(rule.clientId, event.target.value)
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 border-l border-border text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(rule.clientId)}
                    aria-label={`Remove ${title} rule ${index + 1}`}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
                {error && (
                  <p
                    id={errorId}
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit justify-start px-0"
        onClick={onAdd}
      >
        <PlusIcon aria-hidden="true" />
        Add {title} Rule
      </Button>
    </section>
  );
}

function MatchingRulesDialog({
  allCategories,
  category,
  disabled = false,
}: MatchingRulesDialogProps) {
  const [open, setOpen] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [draftRulesOverride, setDraftRulesOverride] = useState<
    readonly CategoryRuleDraft[] | undefined
  >();
  const [initialRulesOverride, setInitialRulesOverride] = useState<
    readonly CategoryRuleDraft[] | undefined
  >();
  const [validationErrors, setValidationErrors] =
    useState<CategoryRuleValidationErrors>({});
  const [saved, setSaved] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const newRuleIdRef = useRef(0);
  const rulesQuery = useCategoryRulesQuery(open);
  const replaceMutation = useReplaceCategoryRulesMutation();

  const loadedRules = rulesQuery.data
    ? getSelectedRules(rulesQuery.data, category.id)
    : null;
  const draftRules = draftRulesOverride ?? loadedRules;
  const initialRules = initialRulesOverride ?? loadedRules ?? [];

  const hasUnsavedChanges =
    draftRules !== null &&
    !areCategoryRuleDraftsEqual(draftRules, initialRules);
  const isSaving = replaceMutation.isPending;

  function resetDialogState() {
    setDiscardPrompt(false);
    setDraftRulesOverride(undefined);
    setInitialRulesOverride(undefined);
    setValidationErrors({});
    setSaved(false);
    replaceMutation.reset();
  }

  function closeDialog() {
    if (isSaving) return;

    resetDialogState();
    setOpen(false);
  }

  function requestClose() {
    if (isSaving) return;
    if (hasUnsavedChanges) {
      setDiscardPrompt(true);
      return;
    }

    closeDialog();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      replaceMutation.reset();
      setDiscardPrompt(false);
      setDraftRulesOverride(undefined);
      setInitialRulesOverride(undefined);
      setValidationErrors({});
      setSaved(false);
      setOpen(true);
      return;
    }

    requestClose();
  }

  function updatePattern(clientId: string, pattern: string) {
    setDraftRulesOverride(
      draftRules?.map((rule) =>
        rule.clientId === clientId ? { ...rule, pattern } : rule,
      ),
    );
    setValidationErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[clientId];
      return nextErrors;
    });
    setSaved(false);
    replaceMutation.reset();
  }

  function addRule(matchType: CategoryRuleDraft["matchType"]) {
    setDraftRulesOverride([
      ...(draftRules ?? []),
      createNewDraftRule(
        matchType,
        `new-${matchType}-${newRuleIdRef.current++}`,
      ),
    ]);
    setSaved(false);
    replaceMutation.reset();
  }

  function removeRule(clientId: string) {
    setDraftRulesOverride(
      draftRules?.filter((rule) => rule.clientId !== clientId),
    );
    setValidationErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[clientId];
      return nextErrors;
    });
    setSaved(false);
    replaceMutation.reset();
  }

  async function saveRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || draftRules === null || !rulesQuery.data) return;

    const errors = validateCategoryRuleDraft(
      draftRules,
      rulesQuery.data,
      category.id,
      allCategories,
    );
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const rules: readonly CategoryRuleInput[] = draftRules.map(
      ({ pattern, matchType }) => ({ pattern, matchType }),
    );

    let persistedRules: readonly CategoryRule[];
    try {
      persistedRules = await replaceMutation.mutateAsync({
        categoryId: category.id,
        rules,
      });
    } catch {
      return;
    }

    const persistedDraft = getSelectedRules(persistedRules, category.id);
    setDraftRulesOverride(persistedDraft);
    setInitialRulesOverride(persistedDraft);
    setValidationErrors({});
    setSaved(true);
  }

  function guardDismiss(event: Event) {
    if (isSaving) {
      event.preventDefault();
      return;
    }
    if (hasUnsavedChanges) {
      event.preventDefault();
      setDiscardPrompt(true);
    }
  }

  function handleEscapeKeyDown(event: KeyboardEvent) {
    guardDismiss(event);
  }

  function handleInteractOutside(event: Event) {
    guardDismiss(event);
  }

  function handleCloseAutoFocus(event: Event) {
    event.preventDefault();
    if (triggerRef.current && document.body.contains(triggerRef.current)) {
      triggerRef.current.focus();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Matching Rules for ${category.name}`}
        >
          <ListFilterIcon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        aria-busy={rulesQuery.isPending || isSaving}
        onEscapeKeyDown={handleEscapeKeyDown}
        onInteractOutside={handleInteractOutside}
        onPointerDownOutside={handleInteractOutside}
        onFocusOutside={handleInteractOutside}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        {discardPrompt ? (
          <>
            <DialogHeader>
              <DialogTitle>Discard Matching Rules changes?</DialogTitle>
              <DialogDescription>
                Your changed rules will be cleared. Saved Category Rules will
                remain unchanged.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDiscardPrompt(false)}
              >
                Keep editing
              </Button>
              <Button type="button" variant="destructive" onClick={closeDialog}>
                Discard changes
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={saveRules} noValidate>
            <DialogHeader>
              <p className="text-label text-muted-foreground">
                Category matching
              </p>
              <DialogTitle>Matching rules · {category.name}</DialogTitle>
              <DialogDescription>
                Rules are case-insensitive and normalize surrounding and
                repeated whitespace.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 p-5 sm:p-6">
              {rulesQuery.isPending && (
                <div
                  className="flex items-center gap-3 border border-border bg-muted p-4"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderCircleIcon
                    className="size-5 animate-spin"
                    aria-hidden="true"
                  />
                  <span className="text-label">Loading Matching Rules</span>
                </div>
              )}

              {rulesQuery.isError && (
                <Alert variant="destructive">
                  <AlertCircleIcon aria-hidden="true" />
                  <AlertTitle>Matching Rules could not be loaded</AlertTitle>
                  <AlertDescription>
                    <p>{rulesQuery.error.message}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => void rulesQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {replaceMutation.error && (
                <Alert variant="destructive">
                  <AlertCircleIcon aria-hidden="true" />
                  <AlertTitle>Matching Rules could not be saved</AlertTitle>
                  <AlertDescription>
                    {getSaveErrorMessage(replaceMutation.error)}
                  </AlertDescription>
                </Alert>
              )}

              {saved && (
                <Alert className="border-success bg-success-surface text-success">
                  <CheckCircle2Icon aria-hidden="true" />
                  <AlertTitle>Matching Rules saved</AlertTitle>
                  <AlertDescription>
                    Future Statement Imports will use the saved rules.
                  </AlertDescription>
                </Alert>
              )}

              {draftRules !== null && !rulesQuery.isError && (
                <>
                  <div className="border border-border bg-muted p-4">
                    <p className="font-mono text-sm font-semibold">
                      Automatically categorize matching Transactions
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Exact rules are evaluated before Contains rules. A rule
                      only affects future Statement Imports.
                    </p>
                  </div>
                  <RuleSection
                    errors={validationErrors}
                    matchType="exact"
                    onAdd={() => addRule("exact")}
                    onChange={updatePattern}
                    onRemove={removeRule}
                    rules={draftRules.filter(
                      (rule) => rule.matchType === "exact",
                    )}
                  />
                  <RuleSection
                    errors={validationErrors}
                    matchType="contains"
                    onAdd={() => addRule("contains")}
                    onChange={updatePattern}
                    onRemove={removeRule}
                    rules={draftRules.filter(
                      (rule) => rule.matchType === "contains",
                    )}
                  />
                </>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || draftRules === null}>
                {isSaving ? (
                  <>
                    <LoaderCircleIcon
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    Saving Rules
                  </>
                ) : (
                  <>
                    <CheckIcon aria-hidden="true" />
                    {replaceMutation.error ? "Retry Save Rules" : "Save Rules"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { MatchingRulesDialog };
