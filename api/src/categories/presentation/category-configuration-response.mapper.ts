import type { CategoryConfigurationRecord } from '../application/category-configuration-store';
import {
  CategoryConfigurationBudgetResponseDto,
  CategoryConfigurationResponseDto,
} from './category-configuration-response.dto';
import { toSpaceCategoryResponse } from './category-response.mapper';
import { toCategoryRuleResponse } from '../../category-rules/presentation/category-rule-response.mapper';

export function toCategoryConfigurationResponse(
  configuration: CategoryConfigurationRecord,
): CategoryConfigurationResponseDto {
  return {
    category: toSpaceCategoryResponse(configuration.category),
    budget: configuration.budget
      ? toCategoryConfigurationBudgetResponse(
          configuration.budget.amount,
          configuration.budget.period,
        )
      : null,
    rules: configuration.rules.map(toCategoryRuleResponse),
    rulesRevision: configuration.rulesRevision,
  };
}

export function toCategoryConfigurationBudgetResponse(
  amount: string,
  recurrence: 'monthly' | 'yearly',
): CategoryConfigurationBudgetResponseDto {
  return { amount, currency: 'PHP', recurrence };
}
