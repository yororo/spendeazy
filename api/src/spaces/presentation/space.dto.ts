import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';

export class SpaceParamsDto {
  @ApiProperty({
    description:
      'Positive bigint Space identifier encoded as a decimal string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  spaceId!: string;
}
