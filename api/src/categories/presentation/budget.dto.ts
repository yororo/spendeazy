import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';
import { BUDGET_PERIODS, type BudgetPeriod } from '../application/budget-store';
import { POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN } from '../../http/validation-patterns';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class UpsertBudgetDto {
  @IsString()
  @Matches(POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN)
  @ApiProperty({
    description:
      'Positive exact two-decimal Budget amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '250.00',
  })
  amount!: string;

  @IsString()
  @IsIn(BUDGET_PERIODS)
  @ApiProperty({
    description: 'Recurring Budget period.',
    enum: [...BUDGET_PERIODS],
    example: 'monthly',
  })
  period!: BudgetPeriod;
}
