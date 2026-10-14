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

import type { Expense } from "./dashboard-service";

interface RecentExpensesProps {
  expenses: readonly Expense[];
  showAttribution?: boolean;
}

function RecentExpenses({
  expenses,
  showAttribution = false,
}: RecentExpensesProps) {
  return (
    <>
      <div className="md:hidden">
        {expenses.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">
            No Expenses were recorded for this period.
          </p>
        ) : (
          <ul className="divide-y" aria-label="Recent expenses">
            {expenses.map((expense) => (
              <li key={expense.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium wrap-anywhere">
                    {expense.description}
                  </p>
                  <p className="max-w-1/2 shrink-0 font-mono text-sm font-semibold tabular-nums wrap-anywhere">
                    {formatMoney(expense.amount)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{expense.date}</span>
                  <CategoryBadge category={expense.category} color={expense.categoryColor ?? undefined} className="min-w-0 whitespace-normal wrap-anywhere">
                    {expense.categoryLabel}
                  </CategoryBadge>
                </div>
                {showAttribution && expense.addedByUserId !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Added by User {expense.addedByUserId}
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
            {expenses.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No Expenses were recorded for this period.
                </TableCell>
              </TableRow>
            )}
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {expense.date}
                </TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  <p className="font-medium">{expense.description}</p>
                  {showAttribution && expense.addedByUserId !== undefined && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Added by User {expense.addedByUserId}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <CategoryBadge category={expense.category} color={expense.categoryColor ?? undefined}>
                    {expense.categoryLabel}
                  </CategoryBadge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {expense.account}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">
                  <span>{formatMoney(expense.amount)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export { RecentExpenses };
