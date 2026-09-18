import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CategoryBadge,
  getCategoryColorClass,
  type CategoryColor,
} from "@/shared/category";

import type { AssignmentProvenance } from "./statement-import-service";

interface StatementCategoryMatchProps {
  readonly assignment: AssignmentProvenance;
  readonly categoryId: string | null;
  readonly className?: string;
  readonly getCategoryColor: (categoryId: string) => CategoryColor;
  readonly getCategoryLabel: (categoryId: string) => string;
  readonly matchedCategoryIds: readonly string[];
}

function AssignmentBadge({
  assignment,
}: {
  readonly assignment: AssignmentProvenance;
}) {
  return (
    <Badge
      variant={
        assignment === "rule"
          ? "success"
          : assignment === "manual"
            ? "muted"
            : assignment === "ambiguous"
              ? "outline"
              : "destructive"
      }
      className={
        assignment === "ambiguous"
          ? "border-warning bg-warning-surface text-warning"
          : undefined
      }
    >
      {assignment === "rule"
        ? "Rule"
        : assignment === "manual"
          ? "Manual"
          : assignment === "ambiguous"
            ? "Ambiguous"
            : "Unmapped"}
    </Badge>
  );
}

function CategoryMatchCell({
  assignment,
  categoryId,
  className,
  getCategoryColor,
  getCategoryLabel,
  matchedCategoryIds,
}: StatementCategoryMatchProps) {
  if (categoryId) {
    return (
      <CategoryBadge
        categoryId={categoryId}
        color={getCategoryColor(categoryId)}
        className={className}
      >
        {getCategoryLabel(categoryId)}
      </CategoryBadge>
    );
  }

  if (assignment !== "ambiguous") {
    return (
      <Badge variant="destructive" className={className}>
        Unmapped
      </Badge>
    );
  }

  const matchedCategoryLabels = getMatchedCategoryLabels(
    matchedCategoryIds,
    getCategoryLabel,
  );

  return (
    <div
      className={cn("min-w-0 max-w-full", className)}
      aria-label={`Multiple categories matched: ${matchedCategoryLabels}`}
    >
      <Badge
        variant="outline"
        className="border-warning bg-warning-surface text-warning"
      >
        Multiple categories matched
      </Badge>
      <p className="sr-only">{matchedCategoryLabels}</p>
      <p
        aria-hidden="true"
        className="mt-1 wrap-anywhere text-xs text-warning"
      >
        {matchedCategoryIds.map((matchedCategoryId, index) => (
          <span
            key={matchedCategoryId}
            className="inline-flex items-center gap-1"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0",
                getCategoryColorClass(getCategoryColor(matchedCategoryId)),
              )}
            />
            <span>{getCategoryLabel(matchedCategoryId)}</span>
            {index < matchedCategoryIds.length - 1 && <span>, </span>}
          </span>
        ))}
      </p>
    </div>
  );
}

function getMatchedCategoryLabels(
  categoryIds: readonly string[],
  getCategoryLabel: (categoryId: string) => string,
) {
  return categoryIds.map(getCategoryLabel).join(", ");
}

export { AssignmentBadge, CategoryMatchCell };
export type { StatementCategoryMatchProps };
