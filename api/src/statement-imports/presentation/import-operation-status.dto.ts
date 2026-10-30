import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportPreviewDto } from './import-preview.dto';

export class ImportFailureDetailDto {
  @ApiProperty({
    type: String,
    pattern: '^/(?:[A-Za-z]+|\\d+)(?:/(?:[A-Za-z]+|\\d+))*$',
  })
  field!: string;
  @ApiProperty({ type: String, pattern: '^[A-Za-z_]{1,100}$' })
  code!: string;
}
export class SafeImportFailureDto {
  @ApiProperty({
    type: String,
    pattern: '^[A-Za-z_]{1,100}$',
    description:
      'Retained application failure code, including IMPORT_OPERATION_NOT_COMMITTED when recovery fences an orphaned admission.',
  })
  code!: string;
  @ApiProperty({ type: [ImportFailureDetailDto] })
  details!: ImportFailureDetailDto[];
  @ApiPropertyOptional({ type: ImportPreviewDto })
  review?: ImportPreviewDto;
}
export class PendingImportOperationDto {
  @ApiProperty({ enum: ['pending'] })
  status!: 'pending';
  @ApiProperty({ type: String, format: 'uuid' })
  operationId!: string;
}
export class RejectedImportOperationDto {
  @ApiProperty({ enum: ['not_committed'] })
  status!: 'not_committed';
  @ApiProperty({ type: String, format: 'uuid' })
  operationId!: string;
  @ApiProperty({ type: SafeImportFailureDto })
  failure!: SafeImportFailureDto;
}
