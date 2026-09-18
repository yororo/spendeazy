import { Inject, Injectable } from '@nestjs/common';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from './category-errors';
import { BudgetNotFoundError } from './budget-errors';
import {
  BUDGET_STORE,
  type BudgetRecord,
  type BudgetStore,
  type UpdateBudget,
} from './budget-store';
import { CATEGORY_STORE, type CategoryStore } from './category-store';

export interface PutBudgetResult {
  budget: BudgetRecord;
  created: boolean;
}

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(CATEGORY_STORE) private readonly categoryStore: CategoryStore,
    @Inject(BUDGET_STORE) private readonly budgetStore: BudgetStore,
  ) {}

  async putBudget(
    userId: string,
    categoryId: string,
    input: UpdateBudget,
  ): Promise<PutBudgetResult> {
    const category = await this.getCategory(userId, categoryId);

    const existingBudget = await this.budgetStore.findByCategoryId(categoryId);
    if (existingBudget) {
      if (
        existingBudget.amount === input.amount &&
        existingBudget.period === input.period
      ) {
        return { budget: existingBudget, created: false };
      }

      const replacedBudget = await this.budgetStore.update(categoryId, input);
      if (!replacedBudget) {
        throw new BudgetNotFoundError();
      }

      return { budget: replacedBudget, created: false };
    }

    if (!category.isActive) {
      throw new CategoryInactiveError();
    }

    const budget = await this.budgetStore.create({ categoryId, ...input });
    return { budget, created: true };
  }

  async getBudget(userId: string, categoryId: string): Promise<BudgetRecord> {
    const category = await this.getCategory(userId, categoryId);

    const budget = await this.budgetStore.findByCategoryId(category.id);
    if (!budget) {
      throw new BudgetNotFoundError();
    }

    return budget;
  }

  async deleteBudget(userId: string, categoryId: string): Promise<void> {
    const category = await this.getCategory(userId, categoryId);

    const deleted = await this.budgetStore.delete(category.id);
    if (!deleted) {
      throw new BudgetNotFoundError();
    }
  }

  private async getCategory(userId: string, categoryId: string) {
    const category = await this.categoryStore.findById(userId, categoryId);
    if (!category) {
      throw new CategoryNotFoundError();
    }

    return category;
  }
}
