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

export interface BudgetFields {
  period: BudgetPeriod;
  amount: string;
}

export interface CreateBudgetInput extends BudgetFields {
  expectedUpdatedAt?: never;
}

export interface ReplaceBudgetInput extends BudgetFields {
  expectedUpdatedAt: string;
}

export type PutBudgetInput = CreateBudgetInput | ReplaceBudgetInput;

export interface NewBudget extends CreateBudgetInput {
  categoryId: string;
}

export type UpdateBudget = ReplaceBudgetInput;

export interface BudgetStore {
  findByCategoryId(categoryId: string): Promise<BudgetRecord | null>;
  create(input: NewBudget): Promise<BudgetRecord>;
  createIfAbsent?(input: NewBudget): Promise<BudgetRecord | null>;
  update(categoryId: string, input: UpdateBudget): Promise<BudgetRecord | null>;
  deleteIfCurrent(
    categoryId: string,
    expectedUpdatedAt: string,
  ): Promise<boolean>;
}
