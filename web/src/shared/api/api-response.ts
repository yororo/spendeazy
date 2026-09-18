type ApiDataErrorFactory = (message: string) => Error;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  parseApiCount,
  parseApiMoney,
  requireApiResponse,
};
export type { ApiDataErrorFactory };
