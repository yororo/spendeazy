import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCategoriesOverviewQuery } from "./categories-queries";
import { EditCategoryDialogContent } from "./edit-category-dialog";
import type { ReportingPeriod } from "@/shared/reporting-period";

interface ContextualBudgetEditorProps {
  readonly categoryId: string;
  readonly period: ReportingPeriod;
  readonly spaceId?: string;
  readonly onClose: () => void;
}

function ContextualBudgetEditor({ categoryId, period, spaceId, onClose }: ContextualBudgetEditorProps) {
  const query = useCategoriesOverviewQuery(period, spaceId);
  const category = query.data?.categories.find(({ id }) => id === categoryId);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    {category ? <EditCategoryDialogContent category={category} spaceId={spaceId} onCancel={onClose} onSaved={onClose} onCloseAutoFocus={() => {}} /> :
      <DialogContent><DialogTitle>Category Budget</DialogTitle><DialogDescription>{query.isError ? query.error.message : query.isPending ? "Loading Category…" : "Category is unavailable in this Space."}</DialogDescription>
        {query.isError && <Button onClick={() => void query.refetch()}>Retry</Button>}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </DialogContent>}
  </Dialog>;
}

export { ContextualBudgetEditor };
