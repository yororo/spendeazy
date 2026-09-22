import { RequestValidationError } from './request-validation-error';

export function normalizeIfMatch(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  return normalized.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}

export function requireOptimisticVersion(
  value: string | undefined,
  resourceName: string,
  field: string,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new RequestValidationError([
      {
        field,
        code: 'required',
        message: `A ${resourceName} version is required. Reload and review your edits before saving.`,
      },
    ]);
  }

  if (!isUtcTimestamp(normalized)) {
    throw new RequestValidationError([
      {
        field,
        code: 'invalid_format',
        message: `${resourceName} version must be a valid timestamp. Reload and review your edits before saving.`,
      },
    ]);
  }

  return normalized;
}

function isUtcTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
