import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/shared/money";
import type { CategorizedStatementEntry } from "./statement-categorizer";
import type { CategoryColorOption, CategoryCatalogOption } from "./statement-import-service";
import { formatImportDate } from "./statement-import-date-formatting";
import { getCategoryLabel } from "./statement-import-utils";
import { getRepeatedStatementEntries, isBulkAssignableExpense } from "./bulk-category-assignment";

interface BulkCategoryPreviewProps {
  readonly source: CategorizedStatementEntry;
  readonly entries: readonly CategorizedStatementEntry[];
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly categoryLabels: readonly CategoryCatalogOption[];
  readonly disabled: boolean;
  readonly onApply: (sourceId: string, selectedIds: readonly string[], categoryId: string) => boolean;
}

function BulkCategoryPreview({ source, entries: expenses, categoryOptions, categoryLabels, disabled, onApply }: BulkCategoryPreviewProps) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = getRepeatedStatementEntries(expenses, source);
  if (!isBulkAssignableExpense(source) || matches.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) {
        setSelectedIds(matches.filter((expense) => isBulkAssignableExpense(expense) && expense.assignment === "unmapped").map((expense) => expense.id));
        setCategoryId("");
        setError(null);
      }
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Categorize repeats of ${source.description}`}>Categorize repeats</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorize repeated descriptions</DialogTitle>
          <DialogDescription>Choose matching expenses in this statement. Existing Categories are replaced only when selected. Excluded rows stay excluded. This Manual assignment does not create a Category Rule.</DialogDescription>
        </DialogHeader>
        <p role="status">{selectedIds.length} of {matches.length} matching rows selected</p>
        <ul aria-label="Matching statement rows" className="space-y-3">
          {matches.map((expense) => {
            const eligible = isBulkAssignableExpense(expense);
            return <li key={expense.id}>
              <label className="flex items-start gap-3 border p-3">
                <Checkbox aria-label={`Select ${expense.description} on ${formatImportDate(expense.entryDate)}`} disabled={!eligible} checked={selectedIds.includes(expense.id)} onCheckedChange={(checked) => {
                  setSelectedIds((current) => checked === true ? [...current, expense.id] : current.filter((id) => id !== expense.id));
                }} />
                <span className="min-w-0 wrap-anywhere">
                  <span className="block">{expense.description}</span>
                  <span className="block font-mono text-xs">{formatImportDate(expense.entryDate)} · {formatMoney(expense.amount)}</span>
                  <span className="block text-sm">{expense.isExcluded ? "Excluded" : expense.categoryId ? `Replace ${getCategoryLabel(categoryLabels, expense.categoryId)}` : expense.assignment === "ambiguous" ? "Ambiguous Category match" : "Unmapped"}</span>
                </span>
              </label>
            </li>;
          })}
        </ul>
        <div className="space-y-2">
          <Label htmlFor={`bulk-category-${source.id}`}>Category for selected expenses</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id={`bulk-category-${source.id}`}><SelectValue placeholder="Choose Category" /></SelectTrigger>
            <SelectContent>{categoryOptions.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {error && <p role="alert">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!categoryId || selectedIds.length === 0} onClick={() => {
            if (onApply(source.id, selectedIds, categoryId)) setOpen(false);
            else setError("The selection could not be applied. Close the preview and try again.");
          }}>Apply to {selectedIds.length} expenses</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { BulkCategoryPreview };
