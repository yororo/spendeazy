import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeBudgetReview, type BudgetReviewHistory } from "@/shared/budget";
import { type ReportingPeriod } from "@/shared/reporting-period";
import type { BudgetReview } from "./budget-reviews";

function BudgetReviewEvidence({ reviews, period, onEditBudget }: {
  readonly reviews: readonly BudgetReview[];
  readonly period: ReportingPeriod;
  readonly onEditBudget?: (categoryId: string, period: ReportingPeriod, evidence: BudgetReviewHistory) => void;
}) {
  const suggestions = reviews.filter(({ suggestReview }) => suggestReview);
  return <section aria-label="Recurring Budget review" className="mb-5">
    <Card><CardHeader><CardTitle>Recurring Budget review</CardTitle></CardHeader><CardContent className="grid gap-4">
      <p className="text-sm text-muted-foreground">Last six eligible recorded Category months completed at or before the selected historical month, or before the current month. Gaps are skipped; recorded spending does not establish complete coverage.</p>
      {suggestions.length === 0 && <p className="text-sm">No Category has at least three recorded breaches of its current monthly limit in eligible months.</p>}
      {reviews.filter(({ months, monthlyBudgetCents }) => months.length > 0 && monthlyBudgetCents !== null).map((review) => <details key={review.categoryId} className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-semibold">{review.label} · {review.breachCount} of {review.months.length} eligible months over current limit{review.suggestReview ? " · Review Budget suggested" : ""}</summary>
        <p className="my-3 font-mono text-sm tabular-nums">{describeBudgetReview(review, review.monthlyBudgetCents)}</p>
        {onEditBudget && <Button variant="outline" aria-label={`Review ${review.label} Budget`} onClick={() => onEditBudget(review.categoryId, period, review)}>Review Budget</Button>}
      </details>)}
      {reviews.filter(({ monthlyBudgetCents, months }) => monthlyBudgetCents === null && months.length > 0).map((review) => <div key={review.categoryId} className="grid gap-2 text-sm">
        <p>{review.label} · No monthly Budget. Set a monthly Budget if there is no existing yearly Budget; otherwise view the preserved yearly Budget.</p>
        <p className="font-mono tabular-nums">{describeBudgetReview(review, null)}</p>
        {onEditBudget && <Button variant="outline" aria-label={`Set ${review.label} Budget from history`} onClick={() => onEditBudget(review.categoryId, period, review)}>Set Budget / View yearly Budget</Button>}
      </div>)}
    </CardContent></Card>
  </section>;
}

export { BudgetReviewEvidence };
