import { useRef } from "react";
import {
  ArchiveIcon,
  EllipsisIcon,
  RotateCcwIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryBadge } from "@/shared/category";
import { formatMoney } from "@/shared/money";

import type { CategoryOverviewItem } from "./categories-service";
import { EditCategoryDialog } from "./edit-category-dialog";
import { MatchingRulesDialog } from "./matching-rules-dialog";

interface MobileCategoryCardProps {
  readonly allCategories: readonly CategoryOverviewItem[];
  readonly category: CategoryOverviewItem;
  readonly disabled?: boolean;
  readonly isStatusPending?: boolean;
  readonly onDeactivate: (
    category: CategoryOverviewItem,
    trigger: HTMLButtonElement,
  ) => void;
  readonly onEditingChange?: (open: boolean) => void;
  readonly onReactivate: (category: CategoryOverviewItem) => void;
}

function MobileCategoryCard({
  allCategories,
  category,
  disabled = false,
  isStatusPending = false,
  onDeactivate,
  onEditingChange,
  onReactivate,
}: MobileCategoryCardProps) {
  const headingId = `mobile-category-${category.id}-heading`;
  const deactivateTriggerRef = useRef<HTMLButtonElement | null>(null);

  function handleDeactivate() {
    const trigger = deactivateTriggerRef.current;
    if (trigger) onDeactivate(category, trigger);
  }

  return (
    <li
      className="min-w-0"
      aria-busy={isStatusPending || undefined}
      aria-labelledby={headingId}
    >
      <Card
        variant="strong"
        className={category.isActive ? "min-w-0" : "min-w-0 bg-muted/50"}
      >
        <CardHeader className="gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-label text-muted-foreground">Category</p>
              <h3
                id={headingId}
                className="mt-1 min-w-0 font-mono text-base font-bold wrap-anywhere"
              >
                <CategoryBadge
                  categoryId={category.id}
                  color={category.color}
                  className="max-w-full whitespace-normal text-left wrap-anywhere"
                >
                  {category.name}
                </CategoryBadge>
              </h3>
            </div>
            <div className="relative flex flex-wrap items-start justify-end gap-2">
              {!category.isActive && <Badge variant="muted">Inactive</Badge>}
              {category.isActive && (
                <>
                  <EditCategoryDialog
                    category={category}
                    disabled={disabled}
                    onEditingChange={onEditingChange}
                  />
                  <MatchingRulesDialog
                    allCategories={allCategories}
                    category={category}
                    disabled={disabled}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild ref={deactivateTriggerRef}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={disabled}
                        aria-label={`More actions for ${category.name}`}
                      >
                        <EllipsisIcon aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      aria-label={`Actions for ${category.name}`}
                    >
                      <DropdownMenuItem
                        aria-label={`Deactivate ${category.name}`}
                        onSelect={handleDeactivate}
                      >
                        <ArchiveIcon aria-hidden="true" />
                        Deactivate
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              {!category.isActive && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onReactivate(category)}
                  disabled={disabled}
                  aria-label={`Reactivate ${category.name}`}
                >
                  <RotateCcwIcon aria-hidden="true" />
                  {isStatusPending ? "Reactivating…" : "Reactivate"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {category.budget === null ? (
          <CardContent className="grid gap-4 p-4">
            <p className="font-mono text-sm font-semibold">No monthly Budget</p>
            <dl>
              <dt className="text-label text-muted-foreground">Spent</dt>
              <dd className="mt-1 text-metric text-xl tabular-nums wrap-anywhere">
                {formatMoney(category.spent)}
              </dd>
            </dl>
            <p className="font-mono text-sm text-muted-foreground">
              Not budgeted
            </p>
          </CardContent>
        ) : (
          <CardContent className="grid gap-4 p-4">
            <dl>
              <dt className="text-label text-muted-foreground">
                Monthly Budget
              </dt>
              <dd className="mt-1 text-metric text-xl tabular-nums wrap-anywhere">
                {formatMoney(category.budget)}
              </dd>
            </dl>

            <dl className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <dt className="text-label text-muted-foreground">Spent</dt>
                <dd className="mt-1 text-metric text-xl tabular-nums wrap-anywhere">
                  {formatMoney(category.spent)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label text-muted-foreground">
                  Remaining
                </dt>
                <dd className="mt-1 text-metric text-xl tabular-nums wrap-anywhere">
                  {category.remaining === null
                    ? "—"
                    : formatMoney(category.remaining)}
                </dd>
              </div>
            </dl>

            {category.usage !== null && (
              <div className="grid gap-2">
                <Progress
                  value={category.usage}
                  aria-label={`${category.name}: ${category.usage}% used`}
                />
                <p className="font-mono text-xs text-muted-foreground">
                  {category.usage}% used
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </li>
  );
}

export { MobileCategoryCard };
