import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { CategoryKey } from "./category";
import { getCategoryColorClass, getCategoryMarkerClass } from "./category-styles";
import type { CategoryColor } from "./category-colors";

interface CategoryBadgeContent {
  children: string;
  className?: string;
  color?: CategoryColor;
}

type CategoryBadgeProps = CategoryBadgeContent &
  (
    | { category: CategoryKey; categoryId?: never }
    | { categoryId: string; category?: CategoryKey; color: CategoryColor }
  );

function CategoryBadge({
  category,
  children,
  className,
  color,
}: CategoryBadgeProps) {
  const markerClass = color
    ? getCategoryColorClass(color)
    : getCategoryMarkerClass(category ?? "other");

  return (
    <Badge variant="outline" className={cn("gap-2 normal-case", className)}>
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0", markerClass)}
      />
      {children}
    </Badge>
  );
}

export { CategoryBadge };
