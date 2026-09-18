import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { BUDGET_PERIODS, type BudgetPeriod } from '../application/budget-store';
import {
  POSITIVE_INTEGER_ID_PATTERN,
  POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN,
} from '../../http/validation-patterns';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  description:
    'A recurring Budget owned through its Category and the authenticated User.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class BudgetResponseDto {
  @ApiProperty({
    description: 'Positive bigint Budget identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description: 'Positive bigint Category identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Budget amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '250.00',
  })
  amount!: string;

  @ApiProperty({
    description: 'Recurring Budget period.',
    enum: [...BUDGET_PERIODS],
    example: 'monthly',
  })
  period!: BudgetPeriod;

  @ApiProperty({
    description: 'UTC timestamp when the Budget was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Budget was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}
