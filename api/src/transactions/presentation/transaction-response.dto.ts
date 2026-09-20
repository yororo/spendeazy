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
import { TRANSACTION_DESCRIPTION_MAX_LENGTH } from '../application/transaction-store';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  description:
    'A manually recorded Transaction owned by the authenticated User.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ManualTransactionResponseDto {
  @ApiProperty({
    description: 'Positive bigint Transaction identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Transaction is Uncategorized.',
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
    description: 'Trimmed Transaction description.',
    minLength: 1,
    maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Transaction amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description: 'The Transaction was recorded manually.',
    enum: ['manual'],
    example: 'manual',
  })
  source!: 'manual';

  @ApiPropertyOptional({
    description:
      'Positive bigint identifier of the User who added the Transaction. It is immutable after creation.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  addedByUserId?: string;

  @ApiProperty({
    description: 'UTC timestamp when the Transaction was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Transaction was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

@ApiSchema({
  description:
    'A Transaction committed from a reviewed Statement import and owned by the authenticated User.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ImportedTransactionResponseDto {
  @ApiProperty({
    description: 'Positive bigint Transaction identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Transaction is Uncategorized.',
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
    description: 'Trimmed Transaction description retained from the import.',
    minLength: 1,
    maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Transaction amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description:
      'The Transaction was committed from a reviewed Statement import.',
    enum: ['imported'],
    example: 'imported',
  })
  source!: 'imported';

  @ApiPropertyOptional({
    description:
      'Positive bigint identifier of the User who added the Transaction. It is immutable after creation.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  addedByUserId?: string;

  @ApiProperty({
    description: 'UTC timestamp when the Transaction was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Transaction was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

@ApiSchema({
  description:
    'A manually recorded Transaction in the history collection. Manual Transactions have no Statement import relationship.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ManualTransactionHistoryResponseDto {
  @ApiProperty({
    description: 'Positive bigint Transaction identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Transaction is Uncategorized.',
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
    description: 'Trimmed Transaction description.',
    minLength: 1,
    maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Transaction amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description: 'The Transaction was recorded manually.',
    enum: ['manual'],
    example: 'manual',
  })
  source!: 'manual';

  @ApiPropertyOptional({
    description:
      'Positive bigint identifier of the User who added the Transaction. It is immutable after creation.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  addedByUserId?: string;

  @ApiProperty({
    description:
      'Manual Transactions are not associated with a Statement import.',
    enum: [null],
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    type: String,
    example: null,
  })
  statementImportId!: null;

  @ApiProperty({
    description: 'UTC timestamp when the Transaction was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Transaction was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

@ApiSchema({
  description:
    'An imported Transaction in the history collection. Imported Transactions retain their Statement import relationship.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ImportedTransactionHistoryResponseDto {
  @ApiProperty({
    description: 'Positive bigint Transaction identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description:
      'Positive bigint Category identifier encoded as a string, or null when the Transaction is Uncategorized.',
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
    description: 'Trimmed Transaction description retained from the import.',
    minLength: 1,
    maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @ApiProperty({
    description:
      'Positive exact two-decimal Transaction amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ApiProperty({
    description:
      'The Transaction was committed from a reviewed Statement import.',
    enum: ['imported'],
    example: 'imported',
  })
  source!: 'imported';

  @ApiPropertyOptional({
    description:
      'Positive bigint identifier of the User who added the Transaction. It is immutable after creation.',
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
    description: 'UTC timestamp when the Transaction was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Transaction was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

@ApiSchema({
  description:
    'A keyset-paginated Transaction history page. Results are ordered by purchaseDate descending, then Transaction ID descending.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class TransactionHistoryPageResponseDto {
  @ApiProperty({
    description:
      'Transactions ordered by purchaseDate descending, then Transaction ID descending. The source discriminator selects manual or imported history relationships.',
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(ManualTransactionHistoryResponseDto) },
        { $ref: getSchemaPath(ImportedTransactionHistoryResponseDto) },
      ],
      discriminator: {
        propertyName: 'source',
        mapping: {
          manual: getSchemaPath(ManualTransactionHistoryResponseDto),
          imported: getSchemaPath(ImportedTransactionHistoryResponseDto),
        },
      },
    },
  })
  items!: Array<
    ManualTransactionHistoryResponseDto | ImportedTransactionHistoryResponseDto
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
