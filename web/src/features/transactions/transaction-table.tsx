import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { HistoryIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { CategoryBadge } from "@/shared/category";
import { formatMoney } from "@/shared/money";

import type { Transaction } from "./transactions-service";

interface TransactionTableProps {
  transactions: readonly Transaction[];
  emptyMessage: string;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  onViewActivity?: (transaction: Transaction) => void;
  showAttribution?: boolean;
  ariaLabel?: string;
}

function TransactionTable({
  transactions,
  emptyMessage,
  onEdit,
  onDelete,
  onViewActivity,
  showAttribution = false,
  ariaLabel = "All transactions",
}: TransactionTableProps) {
  const hasActions =
    onEdit !== undefined ||
    onDelete !== undefined ||
    onViewActivity !== undefined;

  return (
    <>
      <div className="md:hidden">
        {transactions.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="divide-y" aria-label={ariaLabel}>
            {transactions.map((transaction) => (
              <li key={transaction.id} className="space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium wrap-anywhere">
                    {transaction.description}
                  </p>
                  {transaction.deletedAt !== undefined && (
                    <p className="text-xs font-medium uppercase text-destructive">
                      Deleted
                    </p>
                  )}
                  <p className="max-w-1/2 shrink-0 text-right font-mono text-sm font-semibold tabular-nums wrap-anywhere">
                    {formatMoney(transaction.amount)}
                  </p>
                </div>
                <div className="flex items-end justify-between gap-3 text-xs text-muted-foreground">
                  <CategoryBadge
                    category={transaction.category}
                    color={transaction.categoryColor ?? undefined}
                    className="min-w-0 whitespace-normal wrap-anywhere"
                  >
                    {transaction.categoryLabel}
                  </CategoryBadge>
                  <p className="min-w-0 text-right font-mono wrap-anywhere">
                    <span>{transaction.date}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{transaction.account}</span>
                  </p>
                </div>
                {showAttribution && transaction.addedByUserId !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Added by User {transaction.addedByUserId}
                  </p>
                )}
                {hasActions && (
                  <div className="flex justify-end gap-2">
                    {onEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(transaction)}
                      >
                        <PencilIcon aria-hidden="true" />
                        Edit
                      </Button>
                    )}
                    {onDelete && transaction.source !== "imported" && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(transaction)}
                      >
                        <Trash2Icon aria-hidden="true" />
                        Delete
                      </Button>
                    )}
                    {onViewActivity && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onViewActivity(transaction)}
                      >
                        <HistoryIcon aria-hidden="true" />
                        Activity
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden md:block">
        <Table aria-label={ariaLabel}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col">Description</TableHead>
              <TableHead scope="col">Category</TableHead>
              <TableHead scope="col">Account</TableHead>
              <TableHead scope="col" className="text-right">
                Amount
              </TableHead>
              {hasActions && <TableHead scope="col">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={hasActions ? 6 : 5}
                  className="py-10 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {transaction.date}
                </TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  <p className="font-medium">{transaction.description}</p>
                  {transaction.deletedAt !== undefined && (
                    <p className="mt-1 text-xs font-medium uppercase text-destructive">
                      Deleted
                    </p>
                  )}
                  {showAttribution && transaction.addedByUserId !== undefined && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Added by User {transaction.addedByUserId}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <CategoryBadge
                    category={transaction.category}
                    color={transaction.categoryColor ?? undefined}
                  >
                    {transaction.categoryLabel}
                  </CategoryBadge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {transaction.account}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">
                  <span>{formatMoney(transaction.amount)}</span>
                </TableCell>
                {hasActions && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {onEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit(transaction)}
                          aria-label={`Edit ${transaction.description}`}
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                      )}
                      {onDelete && transaction.source !== "imported" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDelete(transaction)}
                          aria-label={`Delete ${transaction.description}`}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      )}
                      {onViewActivity && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onViewActivity(transaction)}
                          aria-label={`View activity for ${transaction.description}`}
                        >
                          <HistoryIcon aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export { TransactionTable };
