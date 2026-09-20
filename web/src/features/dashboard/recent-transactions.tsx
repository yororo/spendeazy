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

import type { Transaction } from "./dashboard-service";

interface RecentTransactionsProps {
  transactions: readonly Transaction[];
  showAttribution?: boolean;
}

function RecentTransactions({
  transactions,
  showAttribution = false,
}: RecentTransactionsProps) {
  return (
    <>
      <div className="md:hidden">
        {transactions.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">
            No Transactions were recorded for this period.
          </p>
        ) : (
          <ul className="divide-y" aria-label="Recent transactions">
            {transactions.map((transaction) => (
              <li key={transaction.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium wrap-anywhere">
                    {transaction.description}
                  </p>
                  <p className="max-w-1/2 shrink-0 font-mono text-sm font-semibold tabular-nums wrap-anywhere">
                    {formatMoney(transaction.amount)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{transaction.date}</span>
                  <CategoryBadge category={transaction.category} color={transaction.categoryColor ?? undefined} className="min-w-0 whitespace-normal wrap-anywhere">
                    {transaction.categoryLabel}
                  </CategoryBadge>
                </div>
                {showAttribution && transaction.addedByUserId !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Added by User {transaction.addedByUserId}
                  </p>
                )}
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
                  No Transactions were recorded for this period.
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
                  {showAttribution && transaction.addedByUserId !== undefined && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Added by User {transaction.addedByUserId}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <CategoryBadge category={transaction.category} color={transaction.categoryColor ?? undefined}>
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

export { RecentTransactions };
