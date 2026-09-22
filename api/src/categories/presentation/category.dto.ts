import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsBoolean,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  normalizeCategoryDescription,
  normalizeCategoryDisplayName,
} from '../application/categories.service';
import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
} from '../application/category-store';
import {
  CATEGORY_COLORS,
  type CategoryColor,
} from '../application/category-color';
import { requireAtLeastOneField } from '../../http/require-at-least-one-field';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
  minProperties?: number;
};

export class CategoryParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  categoryId!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, CATEGORY_NAME_MAX_LENGTH)
  @Transform(trimCategoryName)
  @ApiProperty({
    description:
      'Category display name. It is trimmed before storage and uniqueness checking; uniqueness is case-insensitive.',
    minLength: 1,
    maxLength: CATEGORY_NAME_MAX_LENGTH,
    pattern: '\\S',
    example: 'Dining Out',
  })
  name!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Length(0, CATEGORY_DESCRIPTION_MAX_LENGTH)
  @Transform(normalizeDescription)
  @ApiPropertyOptional({
    type: String,
    description:
      'Optional Category description. Leading and trailing whitespace is removed; blank text is stored as null.',
    nullable: true,
    maxLength: CATEGORY_DESCRIPTION_MAX_LENGTH,
    example: 'Restaurants and cafes',
  })
  description?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsIn([...CATEGORY_COLORS])
  @ApiPropertyOptional({
    enum: [...CATEGORY_COLORS],
    description:
      'Optional palette identifier for the Category Color. When omitted, the API resolves a stable default from the Category identity.',
    example: 'teal',
  })
  color?: CategoryColor;
}

@ApiSchema({
  additionalProperties: false,
  minProperties: 1,
} as ApiSchemaOptionsWithAdditionalProperties)
@requireAtLeastOneField(
  ['name', 'description', 'color', 'isActive'],
  'At least one category field is required',
)
export class UpdateCategoryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Length(1, CATEGORY_NAME_MAX_LENGTH)
  @Transform(trimCategoryName)
  @ApiPropertyOptional({
    description:
      'Category display name. It is trimmed before storage and uniqueness checking; uniqueness is case-insensitive.',
    minLength: 1,
    maxLength: CATEGORY_NAME_MAX_LENGTH,
    pattern: '\\S',
    example: 'Dining Out',
  })
  name?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Length(0, CATEGORY_DESCRIPTION_MAX_LENGTH)
  @Transform(normalizeDescription)
  @ApiPropertyOptional({
    type: String,
    description:
      'Optional Category description. Leading and trailing whitespace is removed; null or blank text clears it.',
    nullable: true,
    maxLength: CATEGORY_DESCRIPTION_MAX_LENGTH,
    example: 'Restaurants and cafes',
  })
  description?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      'Whether the Category is active. Inactive Categories retain their historical relationships and cannot receive a new Budget, although an existing Budget may still be replaced.',
    example: false,
  })
  isActive?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsIn([...CATEGORY_COLORS])
  @ApiPropertyOptional({
    enum: [...CATEGORY_COLORS],
    description:
      'Palette identifier for the Category Color. Saved colors remain unchanged when this field is omitted.',
    example: 'teal',
  })
  color?: CategoryColor;

  @ValidateIf((_, value) => value !== undefined)
  @IsString({
    message:
      'Category version must be a valid timestamp. Reload and review your edits before saving.',
  })
  @IsISO8601(
    { strict: true },
    {
      message:
        'Category version must be a valid timestamp. Reload and review your edits before saving.',
    },
  )
  @ApiProperty({
    description:
      'Required UTC timestamp returned by the last read. Reload and review your edits when the Category has changed elsewhere.',
    format: 'date-time',
    required: true,
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

function normalizeDescription({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  return typeof input === 'string'
    ? normalizeCategoryDescription(input)
    : input;
}

function trimCategoryName({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  return typeof input === 'string'
    ? normalizeCategoryDisplayName(input)
    : input;
}
