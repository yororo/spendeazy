const API_BASE_URL_ENV = "VITE_API_BASE_URL";

type ApiEnvironment = Readonly<Record<string, unknown>>;

interface ApiConfig {
  baseUrl: string;
}

class ApiConfigurationError extends Error {
  readonly kind = "configuration" as const;

  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

function configurationError(message: string): ApiConfigurationError {
  return new ApiConfigurationError(
    `${message} Copy .env.example to .env.local and set ${API_BASE_URL_ENV}.`,
  );
}

function readApiConfig(
  environment: ApiEnvironment = import.meta.env,
): ApiConfig {
  const baseUrlValue = environment[API_BASE_URL_ENV];
  if (typeof baseUrlValue !== "string" || baseUrlValue.trim().length === 0) {
    throw configurationError(`Missing ${API_BASE_URL_ENV}.`);
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue.trim());
  } catch {
    throw configurationError(`${API_BASE_URL_ENV} must be a valid API origin.`);
  }

  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.pathname !== "/" ||
    baseUrl.search.length > 0 ||
    baseUrl.hash.length > 0 ||
    baseUrl.username.length > 0 ||
    baseUrl.password.length > 0
  ) {
    throw configurationError(
      `${API_BASE_URL_ENV} must be an HTTP or HTTPS origin without a path.`,
    );
  }

  return { baseUrl: baseUrl.origin };
}

export {
  API_BASE_URL_ENV,
  ApiConfigurationError,
  readApiConfig,
};
export type { ApiConfig, ApiEnvironment };
