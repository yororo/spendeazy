type ApiDataErrorFactory = (message: string) => Error;

const UTC_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUtcDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = UTC_DATE_TIME_PATTERN.exec(value);
  if (!match) return false;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;

  const date = new Date(timestamp);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6])
  );
}

function buildApiPath(
  resource: string,
  parameters: Readonly<Record<string, string | null | undefined>>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(parameters).forEach(([name, value]) => {
    if (value !== null && value !== undefined) searchParams.set(name, value);
  });

  return `${resource}?${searchParams.toString()}`;
}

function requireApiResponse<T>(
  response: T | undefined,
  description: string,
  createError: ApiDataErrorFactory,
): T {
  if (response === undefined) {
    throw createError(`The API returned no ${description}.`);
  }

  return response;
}

function parseApiMoney(
  value: string,
  field: string,
  createError: ApiDataErrorFactory,
) {
  const amount = Number(value);
  if (value.trim().length === 0 || !Number.isFinite(amount)) {
    throw createError(`The API returned an invalid monetary value for ${field}.`);
  }

  return amount;
}

function parseApiCount(
  value: string,
  field: string,
  createError: ApiDataErrorFactory,
) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw createError(`The API returned an invalid count for ${field}.`);
  }

  return count;
}

export {
  buildApiPath,
  isRecord,
  isUtcDateTime,
  parseApiCount,
  parseApiMoney,
  requireApiResponse,
};
export type { ApiDataErrorFactory };
