import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/shared/money";
import type { CategorizedTransaction } from "./statement-categorizer";
import type { CategoryColorOption, CategoryCatalogOption } from "./statement-import-service";
import { formatImportDate } from "./statement-import-date-formatting";
import { getCategoryLabel } from "./statement-import-utils";
import { getRepeatedStatementTransactions, isBulkAssignableExpense } from "./bulk-category-assignment";

interface BulkCategoryPreviewProps {
  readonly source: CategorizedTransaction;
  readonly transactions: readonly CategorizedTransaction[];
  readonly categoryOptions: readonly CategoryColorOption[];
  readonly categoryLabels: readonly CategoryCatalogOption[];
  readonly disabled: boolean;
  readonly onApply: (sourceId: string, selectedIds: readonly string[], categoryId: string) => boolean;
}

function BulkCategoryPreview({ source, transactions, categoryOptions, categoryLabels, disabled, onApply }: BulkCategoryPreviewProps) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = getRepeatedStatementTransactions(transactions, source);
  if (!isBulkAssignableExpense(source) || matches.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) {
        setSelectedIds(matches.filter((transaction) => isBulkAssignableExpense(transaction) && transaction.assignment === "unmapped").map((transaction) => transaction.id));
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
          {matches.map((transaction) => {
            const eligible = isBulkAssignableExpense(transaction);
            return <li key={transaction.id}>
              <label className="flex items-start gap-3 border p-3">
                <Checkbox aria-label={`Select ${transaction.description} on ${formatImportDate(transaction.transactionDate)}`} disabled={!eligible} checked={selectedIds.includes(transaction.id)} onCheckedChange={(checked) => {
                  setSelectedIds((current) => checked === true ? [...current, transaction.id] : current.filter((id) => id !== transaction.id));
                }} />
                <span className="min-w-0 wrap-anywhere">
                  <span className="block">{transaction.description}</span>
                  <span className="block font-mono text-xs">{formatImportDate(transaction.transactionDate)} · {formatMoney(transaction.amount)}</span>
                  <span className="block text-sm">{transaction.isExcluded ? "Excluded" : transaction.categoryId ? `Replace ${getCategoryLabel(categoryLabels, transaction.categoryId)}` : transaction.assignment === "ambiguous" ? "Ambiguous Category match" : "Unmapped"}</span>
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
