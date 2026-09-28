import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class StatementCategorySuggestionItemResponseDto {
  @ApiProperty({
    description: 'Positive bigint Category identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId!: string;

  @ApiProperty({
    description: 'The current display name of the active Category.',
    maxLength: 100,
    example: 'Groceries',
  })
  categoryName!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class StatementCategorySuggestionResponseDto {
  @ApiProperty({
    description:
      'One active Category suggestion, or null when no Category is supported.',
    type: StatementCategorySuggestionItemResponseDto,
    nullable: true,
  })
  suggestion!: StatementCategorySuggestionItemResponseDto | null;
}
