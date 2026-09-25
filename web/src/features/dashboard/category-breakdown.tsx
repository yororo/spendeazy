import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CategoryBadge, getCategoryColorClass } from "@/shared/category";
import { formatMoney } from "@/shared/money";

import type { CategorySpend } from "./dashboard-service";

interface CategoryBreakdownProps {
  categories: readonly CategorySpend[];
}

function CategoryBreakdown({ categories }: CategoryBreakdownProps) {
  return (
    <Card
      variant="strong"
      id="categories"
      className="flex h-full max-h-[min(32rem,70vh)] flex-col overflow-hidden"
    >
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>By category</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Share of monthly spending
          </p>
        </div>
        <Button asChild variant="ghost" className="min-h-11 shrink-0 md:hidden">
          <Link to="/categories" aria-label="View all categories">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No categorized spending was recorded for this period.
          </p>
        )}
        {categories.map((item, index) => (
          <div key={item.id} className={index >= 4 ? "hidden md:block" : undefined}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <CategoryBadge category={item.category} color={item.color} className="min-w-0 whitespace-normal wrap-anywhere md:whitespace-nowrap">
                {item.label}
              </CategoryBadge>
              <span className="max-w-1/2 shrink-0 font-mono text-xs font-semibold tabular-nums wrap-anywhere">
                {formatMoney(item.amount)}
              </span>
            </div>
            <div
              className="h-2 bg-muted"
              role="img"
              aria-label={`${item.label}: ${item.share}% of monthly spending`}
            >
              <div
                className={cn("h-full", getCategoryColorClass(item.color))}
                style={{ width: `${item.share}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export { CategoryBreakdown };
