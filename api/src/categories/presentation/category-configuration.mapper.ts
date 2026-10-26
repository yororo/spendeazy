import type { CategoryConfigurationInput } from '../application/category-configuration-store';
import type { CategoryConfigurationDto } from './category-configuration.dto';

export function toCategoryConfigurationInput(
  input: CategoryConfigurationDto,
): CategoryConfigurationInput {
  return {
    name: input.name,
    iconKey: input.iconKey,
    color: input.colorKey,
    isActive: input.isActive,
    budget:
      input.budget === null
        ? null
        : {
            amount: input.budget.amount,
            recurrence: input.budget.recurrence,
          },
    rules: input.rules.map(({ pattern, matchType }) => ({
      pattern,
      matchType,
    })),
    expectedRevision: input.expectedRevision,
    expectedRulesRevision: input.expectedRulesRevision,
  };
}
