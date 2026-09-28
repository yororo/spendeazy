import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class StatementCategorySuggestionRequestDto {
  @ApiProperty({
    description: 'The reviewed Transaction description to categorize.',
    minLength: 1,
    maxLength: 500,
    pattern: '\\S',
    example: 'Market purchase',
  })
  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  description!: string;
}
