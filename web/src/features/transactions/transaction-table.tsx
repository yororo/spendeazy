import { useId, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FilterIcon, HistoryIcon, PencilIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { CategoryBadge } from "@/shared/category";
import { formatMoney } from "@/shared/money";
import type { AccountOption } from "@/shared/account";

import type { Transaction, TransactionListFilters } from "./transactions-service";

interface AttributionMember {
  readonly id: string;
  readonly name: string;
}

interface TransactionTableProps {
  transactions: readonly Transaction[];
  emptyMessage: string;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  onViewActivity?: (transaction: Transaction) => void;
  allowImportedDeletion?: boolean;
  showAttribution?: boolean;
  attributionMembers?: readonly AttributionMember[];
  ariaLabel?: string;
  serverFilters?: TransactionListFilters;
  onServerFiltersChange?: (filters: TransactionListFilters) => void;
  categoryOptions?: readonly { id: string; label: string }[];
  accountOptions?: readonly AccountOption[];
  totalCount?: number;
}

function TransactionTable({
  transactions,
  emptyMessage,
  onEdit,
  onDelete,
  onViewActivity,
  allowImportedDeletion = false,
  showAttribution = false,
  attributionMembers,
  ariaLabel = "All transactions",
  serverFilters,
  onServerFiltersChange,
  categoryOptions,
  accountOptions = [],
  totalCount,
}: TransactionTableProps) {
  const controlId = useId();
  const [localSearch, setLocalSearch] = useState("");
  const [localDateFrom, setLocalDateFrom] = useState("");
  const [localDateTo, setLocalDateTo] = useState("");
  const [localCategoryFilter, setLocalCategoryFilter] = useState("all");
  const [sort, setSort] = useState("date-desc");
  const search = serverFilters?.search ?? localSearch;
  const dateFrom = serverFilters?.fromDate ?? localDateFrom;
  const dateTo = serverFilters?.toDate ?? localDateTo;
  const categoryFilter = serverFilters?.categoryId ?? localCategoryFilter;
  const accountFilter = serverFilters?.accountKey ?? "all";
  const updateFilter = (key: keyof TransactionListFilters, value: string) => {
    if (serverFilters && onServerFiltersChange) onServerFiltersChange({ ...serverFilters, [key]: value });
  };
  const setSearch = (value: string) => serverFilters ? updateFilter("search", value) : setLocalSearch(value);
  const setDateFrom = (value: string) => serverFilters ? updateFilter("fromDate", value) : setLocalDateFrom(value);
  const setDateTo = (value: string) => serverFilters ? updateFilter("toDate", value) : setLocalDateTo(value);
  const setCategoryFilter = (value: string) => serverFilters ? updateFilter("categoryId", value) : setLocalCategoryFilter(value);
  const setAccountFilter = (value: string) => updateFilter("accountKey", value);
  const categories = categoryOptions?.map((category) => [category.id, category.label] as const) ?? Array.from(
    new Map(transactions.filter((transaction) => transaction.categoryId !== null)
      .map((transaction) => [transaction.categoryId, transaction.categoryLabel])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const visibleTransactions = transactions.filter((transaction) => serverFilters || (
    transaction.description.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (!dateFrom || transaction.purchaseDate >= dateFrom) &&
    (!dateTo || transaction.purchaseDate <= dateTo) &&
    (categoryFilter === "all" ||
      (categoryFilter === "uncategorized" ? transaction.categoryId === null : transaction.categoryId === categoryFilter))),
  ).sort((a, b) => {
    const difference = sort.startsWith("amount")
      ? Math.abs(a.amount) - Math.abs(b.amount)
      : a.purchaseDate.localeCompare(b.purchaseDate);
    return (sort.endsWith("asc") ? difference : -difference) || a.id.localeCompare(b.id);
  });
  const hasFilters = Boolean(search.trim() || dateFrom || dateTo || categoryFilter !== "all" || accountFilter !== "all");
  const hasSheetFilters = Boolean(dateFrom || dateTo || categoryFilter !== "all" || accountFilter !== "all" || sort !== "date-desc");
  function clearFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setCategoryFilter("all");
    setAccountFilter("all");
  }
  function filterFields(prefix: string) {
    return (
      <>
        <div><Label htmlFor={`${prefix}-date-from`}>From</Label><DateInput id={`${prefix}-date-from`} className="mt-1.5 font-mono text-xs" max={dateTo || undefined} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
        <div><Label htmlFor={`${prefix}-date-to`}>To</Label><DateInput id={`${prefix}-date-to`} className="mt-1.5 font-mono text-xs" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
        <div><Label htmlFor={`${prefix}-category`}>Category</Label><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger id={`${prefix}-category`} className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem><SelectItem value="uncategorized">Uncategorized</SelectItem>{categories.map(([id, label]) => <SelectItem key={id} value={id!}>{label}</SelectItem>)}</SelectContent></Select></div>
        {serverFilters && <div><Label htmlFor={`${prefix}-account`}>Account</Label><Select value={accountFilter} onValueChange={setAccountFilter}><SelectTrigger id={`${prefix}-account`} className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Accounts</SelectItem>{accountOptions.map((account) => <SelectItem key={account.key} value={account.key}>{account.label}</SelectItem>)}</SelectContent></Select></div>}
        <div><Label htmlFor={`${prefix}-sort`}>Sort loaded rows by</Label><Select value={sort} onValueChange={setSort}><SelectTrigger id={`${prefix}-sort`} className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date-desc">Date: newest first</SelectItem><SelectItem value="date-asc">Date: oldest first</SelectItem><SelectItem value="amount-desc">Amount: highest first</SelectItem><SelectItem value="amount-asc">Amount: lowest first</SelectItem></SelectContent></Select></div>
      </>
    );
  }
  const hasActions =
    onEdit !== undefined ||
    onDelete !== undefined ||
    onViewActivity !== undefined;

  return (
    <>
      <div className="flex gap-2 border-b p-3 md:hidden">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor={`${controlId}-mobile-search`} className="sr-only">Search descriptions</Label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id={`${controlId}-mobile-search`} aria-label="Search Transactions" className="h-11 border-foreground pl-9" placeholder="Search description" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="relative size-11 border-foreground" aria-label={hasSheetFilters ? "Filter Transactions, filters active" : "Filter Transactions"}>
              <FilterIcon aria-hidden="true" />
              {hasSheetFilters && <span className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-1 ring-foreground" aria-hidden="true" />}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-full max-w-sm flex-col overflow-y-auto p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader className="border-b p-5 pr-14"><SheetTitle>Filter Transactions</SheetTitle><SheetDescription>Results update immediately as filters change.</SheetDescription></SheetHeader>
            <div className="grid gap-4 p-5">
              {filterFields(`${controlId}-mobile`)}
              <Button type="button" variant="outline" disabled={!hasSheetFilters} onClick={() => { setDateFrom(""); setDateTo(""); setCategoryFilter("all"); setAccountFilter("all"); setSort("date-desc"); }}>Clear filters</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden gap-3 border-b p-3 md:grid md:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_10rem_10rem_12rem_12rem_12rem_auto] xl:items-end">
        <div><Label htmlFor={`${controlId}-search`}>Search descriptions</Label><Input id={`${controlId}-search`} className="mt-1.5" placeholder="Search description" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {filterFields(controlId)}
        <Button type="button" variant="outline" disabled={!hasFilters} onClick={clearFilters}>Clear filters</Button>
      </div>
      <p className="border-b px-3 py-2 text-xs text-muted-foreground" role="status">{serverFilters ? `Showing ${visibleTransactions.length} of ${totalCount ?? transactions.length} matching Transactions in the selected Reporting Period` : `Showing ${visibleTransactions.length} of ${transactions.length} loaded Transactions`}</p>
      <div className="md:hidden">
        {visibleTransactions.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">
            {hasFilters ? "No Transactions match the filters." : emptyMessage}
          </p>
        ) : (
          <ul className="divide-y" aria-label={ariaLabel}>
            {visibleTransactions.map((transaction) => (
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
                    Added by {attributionLabel(transaction.addedByUserId, attributionMembers)}
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
                    {onDelete &&
                      (transaction.source !== "imported" ||
                        allowImportedDeletion) && (
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
            {visibleTransactions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={hasActions ? 6 : 5}
                  className="py-10 text-center text-muted-foreground"
                >
                  {hasFilters ? "No Transactions match the filters." : emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {visibleTransactions.map((transaction) => (
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
                      Added by {attributionLabel(transaction.addedByUserId, attributionMembers)}
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
                      {onDelete &&
                        (transaction.source !== "imported" ||
                          allowImportedDeletion) && (
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

function attributionLabel(
  userId: string,
  members: readonly AttributionMember[] | undefined,
): string {
  return members?.find((member) => member.id === userId)?.name ?? `User ${userId}`;
}

export { TransactionTable };
