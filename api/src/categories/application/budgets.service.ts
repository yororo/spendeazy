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
  type UpdateBudget,
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

  async putBudgetInSpace(
    spaceId: string,
    categoryId: string,
    input: UpdateBudget,
  ): Promise<PutBudgetResult> {
    const category = await this.getCategoryInSpace(spaceId, categoryId);
    const existingBudget = await this.budgetStore.findByCategoryId(category.id);

    if (existingBudget) {
      assertCurrentVersion(
        existingBudget.updatedAt,
        input.expectedUpdatedAt,
        true,
      );
      if (
        existingBudget.amount === input.amount &&
        existingBudget.period === input.period
      ) {
        return { budget: existingBudget, created: false };
      }

      const replacedBudget = await this.budgetStore.update(category.id, input);
      if (!replacedBudget) {
        throw new BudgetNotFoundError();
      }

      return { budget: replacedBudget, created: false };
    }

    if (!category.isActive) {
      throw new CategoryInactiveError();
    }

    const budget = this.budgetStore.createIfAbsent
      ? await this.budgetStore.createIfAbsent({ categoryId, ...input })
      : await this.budgetStore.create({ categoryId, ...input });
    if (!budget) {
      throw new StaleEditError();
    }

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

  async deleteBudget(userId: string, categoryId: string): Promise<void> {
    const category = await this.getCategory(userId, categoryId);

    const deleted = await this.budgetStore.delete(category.id);
    if (!deleted) {
      throw new BudgetNotFoundError();
    }
  }

  async deleteBudgetInSpace(
    spaceId: string,
    categoryId: string,
    expectedUpdatedAt?: string,
  ): Promise<void> {
    const category = await this.getCategoryInSpace(spaceId, categoryId);
    const budget = await this.budgetStore.findByCategoryId(category.id);
    if (!budget) {
      throw new BudgetNotFoundError();
    }

    assertCurrentVersion(budget.updatedAt, expectedUpdatedAt);
    const deleted =
      expectedUpdatedAt !== undefined &&
      this.budgetStore.deleteIfCurrent !== undefined
        ? await this.budgetStore.deleteIfCurrent(category.id, expectedUpdatedAt)
        : await this.budgetStore.delete(category.id);
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
  expectedUpdatedAt: string | undefined,
  required = false,
): void {
  if (expectedUpdatedAt === undefined) {
    if (required) throw new StaleEditError();
    return;
  }

  const expectedTime = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedTime) || updatedAt.getTime() !== expectedTime) {
    throw new StaleEditError();
  }
}
