import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN } from '../../http/validation-patterns';
import { BUDGET_PERIODS, type BudgetPeriod } from '../application/budget-store';
import { CategoryResponseDto } from './category-response.dto';
import { CategoryRuleResponseDto } from '../../category-rules/presentation/category-rule-response.dto';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryConfigurationBudgetResponseDto {
  @ApiProperty({
    description: 'Positive exact two-decimal Budget amount in PHP.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '250.00',
  })
  amount!: string;

  @ApiProperty({ enum: ['PHP'], example: 'PHP' })
  currency!: 'PHP';

  @ApiProperty({ enum: [...BUDGET_PERIODS], example: 'monthly' })
  recurrence!: BudgetPeriod;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryConfigurationResponseDto {
  @ApiProperty({ type: () => CategoryResponseDto })
  category!: CategoryResponseDto;

  @ApiProperty({
    type: () => CategoryConfigurationBudgetResponseDto,
    nullable: true,
    description: 'The current Budget, or null when the Category has none.',
  })
  budget!: CategoryConfigurationBudgetResponseDto | null;

  @ApiProperty({
    type: () => [CategoryRuleResponseDto],
    description: 'Complete Category Rules ordered by ascending identifier.',
  })
  rules!: CategoryRuleResponseDto[];

  @ApiProperty({
    description:
      'Space-wide Rule revision for detecting concurrent Rule changes.',
    pattern: '^\\d+$',
    example: '3',
  })
  rulesRevision!: string;
}
