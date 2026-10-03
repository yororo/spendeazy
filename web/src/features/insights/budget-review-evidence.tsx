import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { describeBudgetReview, type BudgetReviewHistory } from "@/shared/budget";
import { centsToMoney, formatMoney } from "@/shared/money";
import { type ReportingPeriod } from "@/shared/reporting-period";
import type { BudgetReview } from "./budget-reviews";

interface BudgetReviewActionProps {
  readonly period: ReportingPeriod;
  readonly onEditBudget?: (categoryId: string, period: ReportingPeriod, evidence: BudgetReviewHistory) => void;
}

function BudgetReviewItem({ review, period, onEditBudget, idPrefix = "insights-budget-review" }: BudgetReviewActionProps & { readonly review: BudgetReview; readonly idPrefix?: string }) {
  return <div className="grid min-w-0 gap-3 border-t border-border pt-3 text-sm">
    <h3 className="break-words font-semibold">{review.label}</h3>
    <p>{review.monthlyBudgetCents === null ? "No monthly Budget. Set a monthly Budget if there is no existing yearly Budget; otherwise view the preserved yearly Budget." : `${review.breachCount} of ${review.months.length} completed recorded months exceeded the current limit${review.suggestReview ? " · Review Budget suggested" : ""}`}</p>
    {review.monthlyBudgetCents !== null && <p className="font-mono tabular-nums">{formatMoney(centsToMoney(review.monthlyBudgetCents))} / month</p>}
    <details><summary className="focus-ledger min-h-11 cursor-pointer py-2 font-semibold">{review.label} · {review.breachCount} of {review.months.length} eligible months over current limit{review.suggestReview ? " · Review Budget suggested" : ""}</summary><p className="py-3 font-mono tabular-nums">{describeBudgetReview(review, review.monthlyBudgetCents)}</p></details>
    {review.months.length === 0 && <p className="text-muted-foreground">No completed recorded months are available yet.</p>}
    {onEditBudget && <Button id={`${idPrefix}-${review.categoryId}`} className="min-h-11 max-w-full h-auto justify-self-start whitespace-normal break-words py-2" variant="outline" aria-label={review.monthlyBudgetCents === null ? `Set ${review.label} Budget from history` : `Review ${review.label} Budget`} onClick={() => onEditBudget(review.categoryId, period, review)}>{review.monthlyBudgetCents === null ? "Set Budget / View yearly Budget" : `Review ${review.label} Budget`}</Button>}
  </div>;
}

function BudgetReviewEvidence({ reviews, period, onEditBudget }: BudgetReviewActionProps & { readonly reviews: readonly BudgetReview[] }) {
  const suggestions = reviews.filter(({ suggestReview }) => suggestReview).sort((a, b) => b.breachCount - a.breachCount || a.label.localeCompare(b.label));
  const otherReviews = reviews.filter(({ suggestReview, months }) => !suggestReview && months.length > 0);
  return <section aria-label="Recurring Budget review">
    <Card>
      <CardHeader><h2 className="font-mono text-xl font-bold">4 · Do my Budgets still fit?</h2><p className="text-sm text-muted-foreground">Review recurring limits against completed recorded months before deciding to adjust them.</p></CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm">{suggestions.length === 0 ? "No Category has at least three recorded breaches of its current monthly limit in eligible months. More history may be needed." : `${suggestions.length} ${suggestions.length === 1 ? "Budget is" : "Budgets are"} worth reviewing. A repeated overrun is a reason to look closer, not an instruction to raise a limit.`}</p>
        {suggestions.slice(0, 3).map(review => <BudgetReviewItem key={review.categoryId} review={review} period={period} onEditBudget={onEditBudget} />)}
        {suggestions.length > 3 && <details><summary className="focus-ledger min-h-11 cursor-pointer py-3 text-sm font-semibold">Show {suggestions.length - 3} more suggested reviews +</summary><div className="grid gap-4">{suggestions.slice(3).map(review => <BudgetReviewItem key={review.categoryId} review={review} period={period} onEditBudget={onEditBudget} />)}</div></details>}
        <details><summary className="focus-ledger min-h-11 cursor-pointer py-3 text-sm font-semibold">Review other Budgets & Categories without monthly limits +</summary><div className="grid gap-4">{otherReviews.map(review => <BudgetReviewItem key={review.categoryId} review={review} period={period} onEditBudget={onEditBudget} />)}{otherReviews.length === 0 && <p className="text-sm">No other completed recorded Category history is available.</p>}</div></details>
        <details><summary className="focus-ledger min-h-11 cursor-pointer py-3 text-sm font-semibold">How Budget review works +</summary><p className="text-sm text-muted-foreground">Last six eligible recorded Category months completed at or before the selected historical month, or before the current month. Gaps are skipped; recorded spending does not establish complete coverage. Comparisons use current monthly Budgets; past Budget amounts are not reconstructed.</p></details>
      </CardContent>
    </Card>
  </section>;
}

export { BudgetReviewEvidence, BudgetReviewItem };
