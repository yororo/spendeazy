import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import { StatementImportResponseDto } from './statement-import-response.dto';
import { ImportAdvisoryWarningDto } from './import-preview.dto';
import { confirmationSchema } from '../application/confirmation-schema';
import type { ImmutableImportConfirmation } from '../application/statement-import-store';
import type { ReviewedImportService } from '../application/reviewed-import.service';

const evidence = structuredClone(confirmationSchema.properties!.evidence);
delete evidence.properties!.transactions;
evidence.required = evidence.required!.filter((key) => key !== 'transactions');
const original = structuredClone(
  confirmationSchema.properties!.evidence.properties!.transactions.items!,
);
delete original.properties!.duplicateReference;

class ImmutableImportConfirmationDto implements ImmutableImportConfirmation {
  @ApiProperty(evidence as ApiPropertyOptions)
  evidence!: ImmutableImportConfirmation['evidence'];
  @ApiProperty({ type: String, pattern: '^\\d+$' }) includedCount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' }) excludedCount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+$' })
  originalExpenseCount!: string;
  @ApiProperty({ type: String, pattern: '^\\d+\\.\\d{2}$' })
  originalExpenseTotal!: string;
  @ApiProperty({ type: [ImportAdvisoryWarningDto] })
  acknowledgedWarnings!: ImmutableImportConfirmation['acknowledgedWarnings'];
  @ApiProperty({ type: String, nullable: true }) acknowledgedWarningDigest!:
    string | null;
}
export class StatementImportDetailResponseDto extends StatementImportResponseDto {
  @ApiProperty({
    type: ImmutableImportConfirmationDto,
    nullable: true,
    description:
      'Immutable original confirmation totals/evidence. Null for legacy imports; distinct from current history Expense counts.',
  })
  confirmation!: ImmutableImportConfirmationDto | null;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'sourceRowId',
        'disposition',
        'originalEvidence',
        'confirmedValues',
        'exclusion',
      ],
      properties: {
        sourceRowId: { type: 'string' },
        disposition: { type: 'string', enum: ['included', 'excluded'] },
        originalEvidence: original,
        confirmedValues: {
          ...confirmationSchema.properties!.expenses.items!,
          nullable: true,
        },
        exclusion: {
          ...confirmationSchema.properties!.excluded.items!,
          nullable: true,
        },
      },
    },
  } as ApiPropertyOptions)
  rows!: Awaited<ReturnType<ReviewedImportService['evidenceRows']>>;
}
