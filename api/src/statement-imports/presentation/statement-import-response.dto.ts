import { ApiProperty, ApiSchema, getSchemaPath } from '@nestjs/swagger';
import {
  DOMAIN_DATE_PATTERN,
  POSITIVE_INTEGER_ID_PATTERN,
} from '../../http/validation-patterns';
import {
  STATEMENT_TYPES,
  type StatementType,
} from '../application/statement-type';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  description:
    'A committed Statement Import belonging to the destination Space. The User who confirmed it remains the importer actor. Client file hashes and persistence fields are not returned.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class StatementImportResponseDto {
  @ApiProperty({
    description:
      'Positive bigint Statement import identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description: 'Statement file name retained after trimming.',
    minLength: 1,
    maxLength: 255,
    pattern: '\\S',
    example: 'august.pdf',
  })
  fileName!: string;

  @ApiProperty({
    description: 'Valid calendar statement date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-31',
  })
  statementDate!: string;

  @ApiProperty({
    description: 'Statement bank name retained after trimming.',
    minLength: 1,
    maxLength: 100,
    pattern: '\\S',
    example: 'Example Bank',
  })
  bank!: string;

  @ApiProperty({
    description:
      'Card type retained after trimming, or null when the statement did not provide one.',
    type: String,
    minLength: 1,
    maxLength: 100,
    pattern: '\\S',
    nullable: true,
    example: 'visa',
  })
  cardType!: string | null;

  @ApiProperty({
    description: 'Automatically classified Statement type.',
    enum: STATEMENT_TYPES,
    example: 'credit_card',
  })
  statementType!: StatementType;

  @ApiProperty({
    description:
      'Inclusive E-Wallet Transaction History Period start; null for Credit Card imports or legacy imports where this control is unavailable.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    nullable: true,
    example: null,
  })
  transactionHistoryStartDate!: string | null;

  @ApiProperty({
    description:
      'Original non-negative E-Wallet Total Debit control; null for Credit Card imports or legacy imports where this control is unavailable.',
    type: String,
    pattern: '^\\d{1,13}\\.\\d{2}$',
    nullable: true,
    example: null,
  })
  totalDebit!: string | null;

  @ApiProperty({
    description: 'UTC timestamp when the Statement import was committed.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  importedAt!: string;

  @ApiProperty({
    description:
      'Positive bigint User identifier for the actor who confirmed this Statement Import. It is immutable actor attribution; the Committed Statement Import belongs to its Space.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  importedByUserId!: string;
}

@ApiSchema({
  description:
    'A Statement import in the destination Space history collection, including its committed Transaction count.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class StatementImportHistoryResponseDto {
  @ApiProperty({
    description:
      'Positive bigint Statement import identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '100',
  })
  id!: string;

  @ApiProperty({
    description: 'Statement file name retained after trimming.',
    minLength: 1,
    maxLength: 255,
    pattern: '\\S',
    example: 'august.pdf',
  })
  fileName!: string;

  @ApiProperty({
    description: 'Valid calendar statement date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-31',
  })
  statementDate!: string;

  @ApiProperty({
    description: 'Statement bank name retained after trimming.',
    minLength: 1,
    maxLength: 100,
    pattern: '\\S',
    example: 'Example Bank',
  })
  bank!: string;

  @ApiProperty({
    description:
      'Card type retained after trimming, or null when the statement did not provide one.',
    type: String,
    minLength: 1,
    maxLength: 100,
    pattern: '\\S',
    nullable: true,
    example: 'visa',
  })
  cardType!: string | null;

  @ApiProperty({
    description: 'Automatically classified Statement type.',
    enum: STATEMENT_TYPES,
    example: 'credit_card',
  })
  statementType!: StatementType;

  @ApiProperty({
    description:
      'Inclusive E-Wallet Transaction History Period start; null for Credit Card imports or legacy imports where this control is unavailable.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    nullable: true,
    example: null,
  })
  transactionHistoryStartDate!: string | null;

  @ApiProperty({
    description:
      'Original non-negative E-Wallet Total Debit control; null for Credit Card imports or legacy imports where this control is unavailable.',
    type: String,
    pattern: '^\\d{1,13}\\.\\d{2}$',
    nullable: true,
    example: null,
  })
  totalDebit!: string | null;

  @ApiProperty({
    description: 'UTC timestamp when the Statement import was committed.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  importedAt!: string;

  @ApiProperty({
    description:
      'Positive bigint User identifier for the actor who confirmed this Statement Import. It is immutable actor attribution; the Committed Statement Import belongs to its Space.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  })
  importedByUserId!: string;

  @ApiProperty({
    description:
      'Non-negative committed Transaction count encoded as a string.',
    type: String,
    pattern: '^\\d+$',
    example: '12',
  })
  transactionCount!: string;
}

@ApiSchema({
  description:
    'A keyset-paginated Statement import history page. Items are ordered by statementDate descending, then Statement import ID descending.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class StatementImportHistoryPageResponseDto {
  @ApiProperty({
    description:
      'Statement imports ordered by statementDate descending, then Statement import ID descending.',
    type: 'array',
    items: { $ref: getSchemaPath(StatementImportHistoryResponseDto) },
  })
  items!: StatementImportHistoryResponseDto[];

  @ApiProperty({
    description:
      'Opaque base64url cursor for the next page, or null when there are no more results. A cursor must be reused with the same date filters; page size is not part of the cursor.',
    type: String,
    minLength: 1,
    pattern: '^[A-Za-z0-9_-]+$',
    nullable: true,
    example: null,
  })
  nextCursor!: string | null;
}
