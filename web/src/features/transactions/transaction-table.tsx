import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryBadge } from "@/shared/category";
import { formatMoney } from "@/shared/money";

import type { Transaction } from "./transactions-service";

interface TransactionTableProps {
  transactions: readonly Transaction[];
  emptyMessage: string;
}

function TransactionTable({
  transactions,
  emptyMessage,
}: TransactionTableProps) {
  return (
    <>
      <div className="md:hidden">
        {transactions.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="divide-y" aria-label="All transactions">
            {transactions.map((transaction) => (
              <li key={transaction.id} className="space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium wrap-anywhere">
                    {transaction.description}
                  </p>
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
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col">Description</TableHead>
              <TableHead scope="col">Category</TableHead>
              <TableHead scope="col">Account</TableHead>
              <TableHead scope="col" className="text-right">
                Amount
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export { TransactionTable };
