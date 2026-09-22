import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import {
  IsISO8601,
  IsIn,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
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

  @ValidateIf((_, value) => value !== undefined)
  @IsString({
    message:
      'Budget version must be a valid timestamp. Reload and review your edits before saving.',
  })
  @IsISO8601(
    { strict: true },
    {
      message:
        'Budget version must be a valid timestamp. Reload and review your edits before saving.',
    },
  )
  @ApiPropertyOptional({
    description:
      'The UTC timestamp returned by the last read. Stale edits are rejected when another save changed the Budget first.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt?: string;
}
