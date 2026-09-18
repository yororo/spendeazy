import { ApiProperty, ApiSchema, getSchemaPath } from '@nestjs/swagger';
import {
  POSITIVE_INTEGER_ID_PATTERN,
  POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN,
} from '../../http/validation-patterns';
import { CATEGORY_NAME_MAX_LENGTH } from '../application/category-store';
import { type BudgetPeriod } from '../application/budget-store';
import {
  SUMMARY_MONTH_PATTERN,
  SUMMARY_PERIODS,
  SUMMARY_YEAR_PATTERN,
} from '../application/category-summary-input';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

const AGGREGATE_TOTAL_PATTERN = /^\d+\.\d{2}$/u;
const AGGREGATE_MONEY_PATTERN = /^-?\d+\.\d{2}$/u;
const COUNT_PATTERN = /^\d+$/u;

@ApiSchema({
  description:
    'A Category aggregate for the requested calendar period. Inactive Categories are included only when they have spending in that period.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategorySummaryItemResponseDto {
  @ApiProperty({
    description: 'Positive bigint Category identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId!: string;

  @ApiProperty({
    description: 'Trimmed Category display name.',
    minLength: 1,
    maxLength: CATEGORY_NAME_MAX_LENGTH,
    pattern: '\\S',
    example: 'Groceries',
  })
  name!: string;

  @ApiProperty({
    description: 'Whether the Category is active.',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description:
      'Non-negative exact two-decimal aggregate spending amount encoded as a string. Aggregate totals are not limited by per-Transaction numeric precision.',
    type: String,
    pattern: AGGREGATE_TOTAL_PATTERN.source,
    example: '1250.00',
  })
  totalAmount!: string;

  @ApiProperty({
    description: 'Non-negative Transaction count encoded as a string.',
    type: String,
    pattern: COUNT_PATTERN.source,
    example: '12',
  })
  transactionCount!: string;

  @ApiProperty({
    description:
      'Matching-period Budget amount encoded as a positive exact two-decimal string, or null when the Category has no Budget for the requested period.',
    type: String,
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    nullable: true,
    example: '1500.00',
  })
  budgetAmount!: string | null;

  @ApiProperty({
    description:
      'Budget amount minus aggregate spending, encoded as an exact two-decimal string; it may be negative when spending exceeds the matching-period Budget, and is null when budgetAmount is null.',
    type: String,
    pattern: AGGREGATE_MONEY_PATTERN.source,
    nullable: true,
    example: '-25.50',
  })
  remainingAmount!: string | null;
}

@ApiSchema({
  description:
    'A complete monthly or yearly Category spending summary owned by the authenticated User.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategorySummaryResponseDto {
  @ApiProperty({
    description: 'Requested calendar period.',
    enum: [...SUMMARY_PERIODS],
    example: 'monthly',
  })
  period!: BudgetPeriod;

  @ApiProperty({
    description: 'Four-digit calendar year used for the summary.',
    pattern: SUMMARY_YEAR_PATTERN.source,
    example: '2026',
  })
  year!: string;

  @ApiProperty({
    description:
      'Two-digit calendar month for a monthly summary, or null for a yearly summary.',
    type: String,
    pattern: SUMMARY_MONTH_PATTERN.source,
    nullable: true,
    example: '08',
  })
  month!: string | null;

  @ApiProperty({
    description:
      'Categories ordered by ascending Category ID. Active Categories are included even with no spending; inactive Categories are included only when they have spending in the requested period.',
    type: 'array',
    items: { $ref: getSchemaPath(CategorySummaryItemResponseDto) },
  })
  categories!: CategorySummaryItemResponseDto[];

  @ApiProperty({
    description:
      'Non-negative exact two-decimal spending total for Uncategorized Transactions, encoded as a string and zero when none exist. Aggregate totals are not limited by per-Transaction numeric precision.',
    type: String,
    pattern: AGGREGATE_TOTAL_PATTERN.source,
    example: '4.50',
  })
  uncategorizedTotal!: string;

  @ApiProperty({
    description:
      'Non-negative count of Uncategorized Transactions encoded as a string.',
    type: String,
    pattern: COUNT_PATTERN.source,
    example: '1',
  })
  uncategorizedCount!: string;
}
