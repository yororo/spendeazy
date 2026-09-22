import { Inject, Injectable } from '@nestjs/common';
import { StaleEditError } from '../../errors/application-error';
import {
  CategoryInactiveError,
  CategoryNotFoundError,
} from './category-errors';
import { BudgetNotFoundError } from './budget-errors';
import {
  BUDGET_STORE,
  type BudgetRecord,
  type BudgetStore,
  type PutBudgetInput,
} from './budget-store';
import { CATEGORY_STORE, type CategoryStore } from './category-store';

export interface PutBudgetResult {
  budget: BudgetRecord;
  created: boolean;
}

type SpaceCategoryStore = {
  findBySpaceId: NonNullable<CategoryStore['findBySpaceId']>;
};

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(CATEGORY_STORE) private readonly categoryStore: CategoryStore,
    @Inject(BUDGET_STORE) private readonly budgetStore: BudgetStore,
  ) {}

  async putBudgetInSpace(
    spaceId: string,
    categoryId: string,
    input: PutBudgetInput,
  ): Promise<PutBudgetResult> {
    const category = await this.getCategoryInSpace(spaceId, categoryId);
    const existingBudget = await this.budgetStore.findByCategoryId(category.id);

    if (existingBudget) {
      if (input.expectedUpdatedAt === undefined) {
        throw new StaleEditError();
      }

      assertCurrentVersion(existingBudget.updatedAt, input.expectedUpdatedAt);
      if (
        existingBudget.amount === input.amount &&
        existingBudget.period === input.period
      ) {
        return { budget: existingBudget, created: false };
      }

      const replacedBudget = await this.budgetStore.update(category.id, {
        amount: input.amount,
        period: input.period,
        expectedUpdatedAt: input.expectedUpdatedAt,
      });
      if (!replacedBudget) {
        throw new StaleEditError();
      }

      return { budget: replacedBudget, created: false };
    }

    if (!category.isActive) {
      throw new CategoryInactiveError();
    }

    if (input.expectedUpdatedAt !== undefined) {
      throw new StaleEditError();
    }

    const budget = this.budgetStore.createIfAbsent
      ? await this.budgetStore.createIfAbsent({
          categoryId,
          amount: input.amount,
          period: input.period,
        })
      : await this.budgetStore.create({
          categoryId,
          amount: input.amount,
          period: input.period,
        });
    if (!budget) {
      throw new StaleEditError();
    }

    return { budget, created: true };
  }

  async getBudgetInSpace(
    spaceId: string,
    categoryId: string,
  ): Promise<BudgetRecord> {
    const category = await this.getCategoryInSpace(spaceId, categoryId);

    const budget = await this.budgetStore.findByCategoryId(category.id);
    if (!budget) {
      throw new BudgetNotFoundError();
    }

    return budget;
  }

  async deleteBudgetInSpace(
    spaceId: string,
    categoryId: string,
    expectedUpdatedAt: string,
  ): Promise<void> {
    const category = await this.getCategoryInSpace(spaceId, categoryId);
    const budget = await this.budgetStore.findByCategoryId(category.id);
    if (!budget) {
      throw new BudgetNotFoundError();
    }

    assertCurrentVersion(budget.updatedAt, expectedUpdatedAt);
    const deleted = await this.budgetStore.deleteIfCurrent(
      category.id,
      expectedUpdatedAt,
    );
    if (!deleted) {
      throw new StaleEditError();
    }
  }

  private async getCategoryInSpace(spaceId: string, categoryId: string) {
    const store = this.categoryStore as SpaceCategoryStore;
    if (!store.findBySpaceId) {
      throw new Error('Space-scoped Category persistence is not configured.');
    }

    const category = await store.findBySpaceId(spaceId, categoryId);
    if (!category) {
      throw new CategoryNotFoundError();
    }

    return category;
  }
}

function assertCurrentVersion(
  updatedAt: Date,
  expectedUpdatedAt: string,
): void {
  const expectedTime = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedTime) || updatedAt.getTime() !== expectedTime) {
    throw new StaleEditError();
  }
}
