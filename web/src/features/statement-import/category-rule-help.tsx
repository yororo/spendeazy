import { Button } from "@/components/ui/button";

import type { CategorizedTransaction } from "./statement-categorizer";
import type { CategoryRule } from "./statement-import-service";

interface CategoryRuleHelpProps {
  readonly layout: "mobile" | "table";
  readonly equivalentRule: boolean;
  readonly rememberRule: boolean;
  readonly matchType: CategoryRule["matchType"];
  readonly previewRows: readonly CategorizedTransaction[];
  readonly editingId: string | null;
  readonly draftDescription: string | undefined;
  readonly draftError: string | null;
  readonly isSaving: boolean;
  readonly onSave: () => void;
  readonly onApplyWithoutRemembering: () => void;
}

function CategoryRuleHelp({
  layout,
  equivalentRule,
  rememberRule,
  matchType,
  previewRows,
  editingId,
  draftDescription,
  draftError,
  isSaving,
  onSave,
  onApplyWithoutRemembering,
}: CategoryRuleHelpProps) {
  return (
    <div className="grid min-w-0 gap-2 text-sm">
      <p>
        {equivalentRule
          ? "An equivalent Rule already remembers this Category for future imports."
          : "Remember to categorize matching descriptions in future imports. Rules are saved immediately, before this import is confirmed."}
      </p>
      {rememberRule && (
        <>
          <p>
            {matchType === "exact"
              ? "Exact matches the entire description, ignoring case and repeated whitespace."
              : "Contains matches anywhere in a description, even within a word. Punctuation matters. Exact Rules take precedence."}
          </p>
          <p>
            {previewRows.length} matching {previewRows.length === 1 ? "row" : "rows"} in this statement
          </p>
          <ul className="max-h-32 overflow-y-auto wrap-anywhere">
            {previewRows.map((row) => (
              <li key={row.id}>
                {row.id === editingId ? draftDescription : row.description}
                {row.isExcluded
                  ? " · Excluded"
                  : row.categoryId
                    ? " · Reviewed assignment retained"
                    : " · Unmapped; existing Rule precedence applies"}
              </li>
            ))}
          </ul>
          <p>Preview shows description matches only. Other reviewed assignments remain unchanged.</p>
          {draftError && (
            <p>
              The save may have completed if the connection was lost. Retry safely reuses an equivalent Rule. Applying without remembering does not undo a Rule already saved.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(draftError || layout === "table") && (
              <Button type="button" disabled={isSaving} onClick={onSave}>
                {draftError ? "Retry" : "Apply & remember"}
              </Button>
            )}
            {draftError && (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={onApplyWithoutRemembering}
              >
                Apply without remembering
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { CategoryRuleHelp };
