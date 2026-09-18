import type { ValidationError } from 'class-validator';
import type { ErrorDetail } from '../errors/application-error';

const VALIDATION_CODES: Record<string, string> = {
  isDefined: 'required',
  isEmail: 'invalid_format',
  isNotEmpty: 'required',
  isString: 'invalid_type',
  atLeastOneUpdateField: 'incompatible',
  matches: 'invalid_format',
  whitelistValidation: 'unknown',
  unknownValue: 'invalid_value',
};

export function toValidationDetails(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field =
      error.property === '_update'
        ? parentPath || '/'
        : `${parentPath}/${escapeJsonPointer(error.property)}`;
    const ownDetails = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) => ({
        field,
        code: validationCode(constraint, message),
        message,
      }),
    );

    return [...ownDetails, ...toValidationDetails(error.children ?? [], field)];
  });
}

function validationCode(constraint: string, message: string): string {
  if (constraint === 'isLength') {
    if (message.includes('longer than or equal')) {
      return 'too_short';
    }
    if (message.includes('shorter than or equal')) {
      return 'too_long';
    }
  }

  return VALIDATION_CODES[constraint] ?? 'invalid_value';
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
