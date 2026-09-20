import { IsString, Matches } from 'class-validator';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';

export class SpaceCategoryParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  spaceId!: string;

  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  categoryId!: string;
}
