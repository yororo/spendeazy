import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { DashboardView } from '../application/dashboard-report-input';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardReportQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['monthly', 'yearly'])
  @ApiPropertyOptional({
    description: 'Dashboard period. Defaults to monthly.',
    enum: ['monthly', 'yearly'],
    example: 'monthly',
  })
  view?: DashboardView;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/u)
  @ApiPropertyOptional({
    description:
      'Final calendar month for the Monthly view. Defaults to the last complete month.',
    type: String,
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
    example: '2026-06',
  })
  endMonth?: string;

  @IsOptional()
  @IsString()
  @IsIn(['1', '3', '6'])
  @ApiPropertyOptional({
    description:
      'Number of calendar months for the Monthly view. Defaults to 1.',
    enum: ['1', '3', '6'],
    default: '1',
  })
  months?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/u)
  @ApiPropertyOptional({
    description: 'Calendar year for the yearly view.',
    type: String,
    pattern: '^\\d{4}$',
    example: '2026',
  })
  year?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[1-9]\d*$/u, { each: true })
  @ApiPropertyOptional({
    description:
      'Repeated Category identifiers to select only Category chart points.',
    type: String,
    isArray: true,
    pattern: '^[1-9]\\d*$',
    example: ['42', '43'],
  })
  chartCategoryId?: string[];
}
