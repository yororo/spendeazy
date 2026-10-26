export type BudgetRecurrence = 'monthly' | 'yearly';

export type BrowseBudget = {
  amount: string;
  currency: 'PHP';
  recurrence: BudgetRecurrence;
};

export type BudgetBrowseCategory = {
  id: string;
  name: string;
  isActive: boolean;
  budget: BrowseBudget | null;
};

export type BudgetBrowseView = 'active' | 'inactive';
export type BudgetPeriodFilter = 'all' | BudgetRecurrence | 'unset';
export type BudgetSortField = 'name' | 'amount';
export type BudgetSortDirection = 'ascending' | 'descending';

export type BudgetBrowseOptions = {
  view: BudgetBrowseView;
  filter: BudgetPeriodFilter;
  search: string;
  sort: BudgetSortField;
  direction: BudgetSortDirection;
};

export type BudgetPlan = {
  monthlyEquivalent: string;
  annualEquivalent: string;
  budgetCount: number;
};

export type BudgetDetails = {
  originalAmount: string;
  originalPeriod: 'month' | 'year';
  monthlyEquivalent: string;
  annualEquivalent: string;
};

const TWELVE = 12n;

export function calculateBudgetPlan(categories: readonly BudgetBrowseCategory[]): BudgetPlan {
  const activeBudgets = categories.filter((category) => category.isActive && category.budget !== null);
  const annualEquivalentCents = activeBudgets.reduce(
    (total, category) => total + monthlyEquivalentNumerator(category.budget!),
    0n,
  );

  return {
    monthlyEquivalent: formatPhpCents(roundHalfUp(annualEquivalentCents, TWELVE)),
    annualEquivalent: formatPhpCents(annualEquivalentCents),
    budgetCount: activeBudgets.length,
  };
}

export function formatBudgetDetails(budget: BrowseBudget): BudgetDetails {
  const annualEquivalentCents = monthlyEquivalentNumerator(budget);

  return {
    originalAmount: formatPhpCents(parsePhpCents(budget.amount)),
    originalPeriod: budget.recurrence === 'monthly' ? 'month' : 'year',
    monthlyEquivalent: formatPhpCents(roundHalfUp(annualEquivalentCents, TWELVE)),
    annualEquivalent: formatPhpCents(annualEquivalentCents),
  };
}

export function selectBudgetCategories<T extends BudgetBrowseCategory>(
  categories: readonly T[],
  options: BudgetBrowseOptions,
): T[] {
  const normalizedSearch = options.search.trim().normalize('NFKC').toLowerCase();
  const isActiveView = options.view === 'active';
  const visible = categories.filter((category) => {
    if (category.isActive !== isActiveView) return false;
    if (!matchesPeriod(category, options.filter)) return false;
    if (normalizedSearch && !category.name.normalize('NFKC').toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });

  return visible.sort((left, right) => compareCategories(left, right, options.sort, options.direction));
}

function matchesPeriod(category: BudgetBrowseCategory, filter: BudgetPeriodFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unset') return category.budget === null;
  return category.budget?.recurrence === filter;
}

function compareCategories(
  left: BudgetBrowseCategory,
  right: BudgetBrowseCategory,
  sort: BudgetSortField,
  direction: BudgetSortDirection,
): number {
  const directionMultiplier = direction === 'ascending' ? 1 : -1;

  if (sort === 'name') {
    return compareCategoryNames(left, right, directionMultiplier);
  }

  const leftEquivalent = left.budget ? monthlyEquivalentNumerator(left.budget) : null;
  const rightEquivalent = right.budget ? monthlyEquivalentNumerator(right.budget) : null;
  if (leftEquivalent === null && rightEquivalent !== null) return 1;
  if (leftEquivalent !== null && rightEquivalent === null) return -1;
  if (leftEquivalent !== null && rightEquivalent !== null) {
    const byEquivalent = compareBigInts(leftEquivalent, rightEquivalent) * directionMultiplier;
    if (byEquivalent !== 0) return byEquivalent;
  }

  return compareCategoryNames(left, right, 1);
}

function compareCategoryNames(
  left: BudgetBrowseCategory,
  right: BudgetBrowseCategory,
  directionMultiplier: 1 | -1,
): number {
  const byNormalizedName = compareStrings(
    left.name.normalize('NFKC').toLowerCase(),
    right.name.normalize('NFKC').toLowerCase(),
  );
  if (byNormalizedName !== 0) return byNormalizedName * directionMultiplier;
  return compareIds(left.id, right.id);
}

function compareIds(left: string, right: string): number {
  if (/^\d+$/u.test(left) && /^\d+$/u.test(right)) {
    return compareBigInts(BigInt(left), BigInt(right)) || compareStrings(left, right);
  }
  return compareStrings(left, right);
}

function compareBigInts(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function monthlyEquivalentNumerator(budget: BrowseBudget): bigint {
  const amountCents = parsePhpCents(budget.amount);
  return budget.recurrence === 'monthly' ? amountCents * TWELVE : amountCents;
}

function parsePhpCents(amount: string): bigint {
  const match = /^(\d+)\.(\d{2})$/u.exec(amount);
  if (!match) throw new TypeError('Budget amounts must be normalized PHP decimal strings.');
  return BigInt(match[1]!) * 100n + BigInt(match[2]!);
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function formatPhpCents(cents: bigint): string {
  const wholeUnits = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  const fractionalUnits = (cents % 100n).toString().padStart(2, '0');
  return `₱${wholeUnits}.${fractionalUnits}`;
}
