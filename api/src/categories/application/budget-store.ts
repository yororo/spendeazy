export const BUDGET_STORE = Symbol('BUDGET_STORE');

export const BUDGET_PERIODS = ['monthly', 'yearly'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export interface BudgetRecord {
  id: string;
  categoryId: string;
  period: BudgetPeriod;
  amount: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateBudget {
  period: BudgetPeriod;
  amount: string;
  expectedUpdatedAt?: string;
}

export interface NewBudget extends UpdateBudget {
  categoryId: string;
}

export interface BudgetStore {
  findByCategoryId(categoryId: string): Promise<BudgetRecord | null>;
  create(input: NewBudget): Promise<BudgetRecord>;
  createIfAbsent?(input: NewBudget): Promise<BudgetRecord | null>;
  update(categoryId: string, input: UpdateBudget): Promise<BudgetRecord | null>;
  delete(categoryId: string): Promise<boolean>;
  deleteIfCurrent?(
    categoryId: string,
    expectedUpdatedAt: string,
  ): Promise<boolean>;
}
