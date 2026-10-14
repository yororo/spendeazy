import {
  ApiProperty,
  ApiPropertyOptional,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  DOMAIN_DATE_PATTERN,
  POSITIVE_INTEGER_ID_PATTERN,
  POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN,
} from '../../http/validation-patterns';
import { EXPENSE_DESCRIPTION_MAX_LENGTH } from '../application/expense-store';

const EXPENSE_ADDED_BY_DESCRIPTION =
  'Positive bigint User identifier of the original Added By actor who recorded or confirmed this Expense. It is immutable attribution and does not determine Space ownership or identify who paid.';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  description:
    'A manually recorded Expense in the authorized Space. The original recorder is retained as Added By attribution.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ManualExpenseResponseDto {
  @ApiProperty({
    description: 'Positive bigint Expense identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Expense is Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId!: string | null;

  @ApiProperty({
    description: 'Valid calendar purchase date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate!: string;

  @ApiProperty({
    description: 'Trimmed Expense description.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Expense amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description: 'The Expense was recorded manually.',
    enum: ['manual'],
    example: 'manual',
  })
  source!: 'manual';

  @ApiPropertyOptional({
    description: EXPENSE_ADDED_BY_DESCRIPTION,
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  addedByUserId?: string;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

@ApiSchema({
  description:
    'A Expense committed from a reviewed Statement Import in the authorized Space. The User who confirmed it remains its Added By actor.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ImportedExpenseResponseDto {
  @ApiProperty({
    description: 'Positive bigint Expense identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Expense is Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId!: string | null;

  @ApiProperty({
    description: 'Valid calendar purchase date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate!: string;

  @ApiProperty({
    description: 'Trimmed Expense description retained from the import.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Expense amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description:
      'The Expense was committed from a reviewed Statement import.',
    enum: ['imported'],
    example: 'imported',
  })
  source!: 'imported';

  @ApiPropertyOptional({
    description: EXPENSE_ADDED_BY_DESCRIPTION,
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  addedByUserId?: string;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

@ApiSchema({
  description:
    'A manually recorded Expense in the history collection. Manual Expenses have no Statement import relationship.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ManualExpenseHistoryResponseDto {
  @ApiProperty({
    description: 'Positive bigint Expense identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Expense is Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId!: string | null;

  @ApiProperty({
    description: 'Valid calendar purchase date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate!: string;

  @ApiProperty({
    description: 'Trimmed Expense description.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Expense amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description: 'The Expense was recorded manually.',
    enum: ['manual'],
    example: 'manual',
  })
  source!: 'manual';

  @ApiPropertyOptional({
    description: EXPENSE_ADDED_BY_DESCRIPTION,
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  addedByUserId?: string;

  @ApiProperty({
    description:
      'Manual Expenses are not associated with a Statement import.',
    enum: [null],
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    type: String,
    example: null,
  })
  statementImportId!: null;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    description:
      'UTC timestamp when the Expense was deleted. Omitted for active Expenses.',
    format: 'date-time',
    example: '2026-09-20T00:00:00.000Z',
  })
  deletedAt?: string;
}

@ApiSchema({
  description:
    'An imported Expense in the history collection. Imported Expenses retain their Statement import relationship.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ImportedExpenseHistoryResponseDto {
  @ApiProperty({
    description: 'Positive bigint Expense identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Expense is Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId!: string | null;

  @ApiProperty({
    description: 'Valid calendar purchase date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate!: string;

  @ApiProperty({
    description: 'Trimmed Expense description retained from the import.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Expense amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description:
      'The Expense was committed from a reviewed Statement import.',
    enum: ['imported'],
    example: 'imported',
  })
  source!: 'imported';

  @ApiPropertyOptional({
    description: EXPENSE_ADDED_BY_DESCRIPTION,
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  addedByUserId?: string;

  @ApiProperty({
    description:
      'Positive bigint Statement import identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '10',
  })
  statementImportId!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Expense was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    description:
      'UTC timestamp when the Expense was deleted. Omitted for active Expenses.',
    format: 'date-time',
    example: '2026-09-20T00:00:00.000Z',
  })
  deletedAt?: string;
}

@ApiSchema({
  description:
    'The editable Expense values captured before or after an edit.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ExpenseActivitySnapshotDto {
  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Expense was Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId!: string | null;

  @ApiProperty({
    description: 'Valid calendar purchase date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate!: string;

  @ApiProperty({
    description: 'Trimmed Expense description at the time of the event.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Expense amount encoded as a string.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;
}

@ApiSchema({
  description:
    'A recorded activity event for an Expense. Legacy Expenses may have no activity records.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ExpenseActivityResponseDto {
  @ApiProperty({
    description: 'Positive bigint activity identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '200',
  })
  id!: string;

  @ApiProperty({
    description: 'Positive bigint Expense identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  expenseId!: string;

  @ApiProperty({
    description: 'The activity event type.',
    enum: ['created', 'edited', 'deleted'],
    example: 'created',
  })
  type!: 'created' | 'edited' | 'deleted';

  @ApiProperty({
    description: 'Positive bigint identifier of the User who caused the event.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  actorUserId!: string;

  @ApiProperty({
    description: 'UTC timestamp when the activity event occurred.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  occurredAt!: string;

  @ApiPropertyOptional({
    description:
      'Expense values before an edit. Present only for edited events.',
    type: ExpenseActivitySnapshotDto,
  })
  before?: ExpenseActivitySnapshotDto;

  @ApiPropertyOptional({
    description:
      'Expense values after an edit. Present only for edited events.',
    type: ExpenseActivitySnapshotDto,
  })
  after?: ExpenseActivitySnapshotDto;
}

@ApiSchema({
  description:
    'A keyset-paginated Expense history page. Results are ordered by purchaseDate descending, then Expense ID descending. Active pages omit deleted Expenses; retained-history pages contain only deleted Expenses.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ExpenseHistoryPageResponseDto {
  @ApiProperty({
    description:
      'Total number of Expenses matching the filters across all pages.',
    type: String,
    pattern: '^\\d+$',
    example: '43',
  })
  totalCount!: string;

  @ApiProperty({
    description:
      'Expenses ordered by purchaseDate descending, then Expense ID descending. The source discriminator selects manual or imported history relationships.',
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(ManualExpenseHistoryResponseDto) },
        { $ref: getSchemaPath(ImportedExpenseHistoryResponseDto) },
      ],
      discriminator: {
        propertyName: 'source',
        mapping: {
          manual: getSchemaPath(ManualExpenseHistoryResponseDto),
          imported: getSchemaPath(ImportedExpenseHistoryResponseDto),
        },
      },
    },
  })
  items!: Array<
    ManualExpenseHistoryResponseDto | ImportedExpenseHistoryResponseDto
  >;

  @ApiProperty({
    description:
      'Opaque base64url cursor for the next page, or null when there are no more results. A cursor must be reused with the same filters; page size is not part of the cursor.',
    type: String,
    minLength: 1,
    pattern: '^[A-Za-z0-9_-]+$',
    nullable: true,
    example: null,
  })
  nextCursor!: string | null;
}
