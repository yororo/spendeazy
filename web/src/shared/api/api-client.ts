import type { ApiConfig } from "./api-config";
import { isRecord } from "./api-response";
import { shouldRetryProvisioning } from "../query";

type ApiErrorKind =
  | "http"
  | "malformed-response"
  | "network"
  | "authentication"
  | "recovery"
  | "request";

type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_JSON"
  | "NOT_ACCEPTABLE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "ROUTE_NOT_FOUND"
  | "HTTP_ERROR"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHENTICATED"
  | "USER_NOT_PROVISIONED"
  | "SPACE_NOT_FOUND"
  | "SPACE_NOT_WRITABLE"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_ALREADY_PENDING"
  | "INVITATION_RATE_LIMITED"
  | "INVITATION_DAILY_LIMIT_REACHED"
  | "INVITATION_SELF"
  | "INVITATION_INELIGIBLE"
  | "INVITATION_EXPIRED"
  | "INVITATION_CANCELED"
  | "INVITATION_DECLINED"
  | "INVITATION_DELIVERY_FAILED"
  | "CONFLICT"
  | "STALE_EDIT"
  | "RESOURCE_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "EMAIL_ALREADY_EXISTS"
  | "CATEGORY_NOT_FOUND"
  | "CATEGORY_NAME_ALREADY_EXISTS"
  | "CATEGORY_INACTIVE"
  | "BUDGET_NOT_FOUND"
  | "CATEGORY_RULE_NOT_FOUND"
  | "CATEGORY_RULE_PATTERN_ALREADY_EXISTS"
  | "TRANSACTION_NOT_FOUND"
  | "STATEMENT_IMPORT_NOT_FOUND"
  | "IMPORTED_TRANSACTION_IMMUTABLE"
  | "STATEMENT_IMPORT_FILE_ALREADY_EXISTS"
  | "STATEMENT_IMPORT_FILE_HASH_INVALID"
  | "STATEMENT_IMPORT_PROBABLE_DUPLICATES"
  | "USER_PROVISIONING_FAILED"
  | "USER_PROVISIONED_RETRY_REQUIRED"
  | "USER_ACCOUNT_LINKING_FAILED";

interface ApiErrorDetail {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

interface ApiRequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: HeadersInit;
  expectedStatuses?: readonly number[];
  replayAfterProvisioning?: boolean;
}

type ApiRequestOptionsWithoutBody = Omit<ApiRequestOptions, "body" | "method">;
type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
interface ApiTokenOptions {
  skipCache?: boolean;
}
type ApiTokenProvider = (options?: ApiTokenOptions) => Promise<string | null>;
type ApiAuthenticationFailureHandler = () => void | Promise<void>;

interface ApiClientOptions {
  sessionId?: string;
  onAuthenticationFailure?: ApiAuthenticationFailureHandler;
}

class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: ApiErrorCode;
  readonly details: readonly ApiErrorDetail[];

  constructor(
    message: string,
    options: {
      kind: ApiErrorKind;
      status?: number;
      code?: ApiErrorCode;
      details?: readonly ApiErrorDetail[];
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
  }
}

interface ApiClient {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T | undefined>;
  get<T>(
    path: string,
    options?: ApiRequestOptionsWithoutBody,
  ): Promise<T | undefined>;
  post<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptionsWithoutBody,
  ): Promise<T | undefined>;
  put<T>(
    path: string,
    body?: unknown,
    options?: ApiRequestOptionsWithoutBody,
  ): Promise<T | undefined>;
  patch<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptionsWithoutBody,
  ): Promise<T | undefined>;
  delete<T>(
    path: string,
    options?: ApiRequestOptionsWithoutBody,
  ): Promise<T | undefined>;
}

type ApiGetClient = Pick<ApiClient, "get">;

function isApiErrorDetail(value: unknown): value is ApiErrorDetail {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

function isApiErrorEnvelope(value: unknown): value is {
  error: {
    code: ApiErrorCode;
    message: string;
    details: readonly ApiErrorDetail[];
  };
} {
  if (!isRecord(value) || !isRecord(value.error)) return false;

  const error = value.error;
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    Array.isArray(error.details) &&
    error.details.every(isApiErrorDetail)
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function isExactUnauthenticatedError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.kind === "http" &&
    error.status === 401 &&
    error.code === "UNAUTHENTICATED"
  );
}

function isExactUserNotProvisionedError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.kind === "http" &&
    error.status === 403 &&
    error.code === "USER_NOT_PROVISIONED"
  );
}

function isSafeReplayMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isUserProvisioningRequest(path: string, method: string): boolean {
  const pathWithoutQuery = path.split(/[?#]/, 1)[0] ?? path;
  return (
    method === "PUT" && (pathWithoutQuery === "" || pathWithoutQuery === "/")
  );
}

function createServiceUnavailableError(cause?: unknown): ApiError {
  return new ApiError("The API service is temporarily unavailable.", {
    kind: "http",
    status: 503,
    code: "SERVICE_UNAVAILABLE",
    cause,
  });
}

function createProvisioningRetryRequiredError(cause: ApiError): ApiError {
  return new ApiError("Your account is ready. Retry this action.", {
    kind: "recovery",
    code: "USER_PROVISIONED_RETRY_REQUIRED",
    cause,
  });
}

function createAccountLinkingError(cause: ApiError): ApiError {
  return new ApiError(
    "Your account could not be linked. Try again or sign out.",
    {
      kind: "recovery",
      status: cause.status,
      code: "USER_ACCOUNT_LINKING_FAILED",
      details: cause.details,
      cause,
    },
  );
}

function createProvisioningRepairError(
  originalError: ApiError,
  repairError: unknown,
): ApiError {
  if (repairError instanceof ApiError) {
    return new ApiError(repairError.message, {
      kind: repairError.kind,
      status: repairError.status,
      code: repairError.code,
      details: repairError.details,
      cause: originalError,
    });
  }

  return new ApiError("The User could not be provisioned.", {
    kind: "recovery",
    code: "USER_PROVISIONING_FAILED",
    cause: originalError,
  });
}

const SELF_SCOPED_API_PATH = "/api/v1/users/me";
const ABSOLUTE_RESOURCE_PATH_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/;
const tokenRefreshPromises = new Map<string, Promise<string | null>>();
const userProvisioningPromises = new Map<
  string,
  Promise<ProvisioningRecoveryResult>
>();
const authenticationFailurePromises = new Map<string, Promise<void>>();

function requestPathError(): ApiError {
  return new ApiError(
    "The API resource path must remain within the self-scoped User boundary.",
    { kind: "request" },
  );
}

function hasParentPathSegment(pathname: string): boolean {
  const pathSegments = pathname.split("/");
  if (pathSegments.some((segment) => segment === "." || segment === "..")) {
    return true;
  }

  try {
    const decodedPathname = decodeURIComponent(pathname);
    return decodedPathname
      .split("/")
      .some((segment) => segment === "." || segment === "..");
  } catch {
    throw requestPathError();
  }
}

function buildUserScopedUrl(config: ApiConfig, path: string): string {
  const relativePath =
    path === "" || path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  if (
    path.startsWith("//") ||
    ABSOLUTE_RESOURCE_PATH_PATTERN.test(path) ||
    path.includes("\\")
  ) {
    throw requestPathError();
  }

  const pathname = relativePath.split(/[?#]/, 1)[0] ?? relativePath;
  if (hasParentPathSegment(pathname)) {
    throw requestPathError();
  }

  return new URL(
    `${SELF_SCOPED_API_PATH}${relativePath}`,
    config.baseUrl,
  ).toString();
}

async function getSessionTokenValue(
  getToken: ApiTokenProvider,
  options?: ApiTokenOptions,
): Promise<string | null> {
  let token: string | null;
  try {
    token = options ? await getToken(options) : await getToken();
  } catch (cause) {
    if (isAbortError(cause)) throw cause;

    throw new ApiError(
      "The current Clerk session could not be authenticated.",
      {
        kind: "authentication",
        code: "UNAUTHENTICATED",
        cause,
      },
    );
  }

  return token?.trim() || null;
}

async function getSessionToken(getToken: ApiTokenProvider): Promise<string> {
  const normalizedToken = await getSessionTokenValue(getToken);
  if (!normalizedToken) {
    throw new ApiError("Authentication required.", {
      kind: "authentication",
      code: "UNAUTHENTICATED",
    });
  }

  return normalizedToken;
}

async function decodeJsonResponse(response: Response): Promise<unknown> {
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (cause) {
    if (isAbortError(cause)) throw cause;

    throw new ApiError("The API returned an unreadable response.", {
      kind: "network",
      status: response.status,
      cause,
    });
  }

  if (bodyText.trim().length === 0) return undefined;

  try {
    return JSON.parse(bodyText) as unknown;
  } catch (cause) {
    throw new ApiError("The API returned malformed JSON.", {
      kind: "malformed-response",
      status: response.status,
      cause,
    });
  }
}

interface PreparedApiRequest {
  readonly url: string;
  readonly method: string;
  readonly serializedBody: string | undefined;
  readonly requestHeaders?: HeadersInit;
  readonly expectedStatuses?: readonly number[];
  readonly fetchOptions: Omit<RequestInit, "body" | "headers" | "method">;
}

interface RequestRecoveryState {
  tokenRefreshUsed: boolean;
  provisioningUsed: boolean;
}

interface ProvisioningRecoveryResult {
  readonly token: string;
  readonly tokenRefreshUsed: boolean;
}

async function sendAuthenticatedRequest<T>(
  preparedRequest: PreparedApiRequest,
  token: string,
  fetchImplementation: FetchImplementation,
): Promise<T | undefined> {
  const headers = new Headers(preparedRequest.requestHeaders);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  headers.delete("Content-Type");
  if (preparedRequest.serializedBody !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetchImplementation(preparedRequest.url, {
      ...preparedRequest.fetchOptions,
      method: preparedRequest.method,
      headers,
      body: preparedRequest.serializedBody,
    });
  } catch (cause) {
    if (isAbortError(cause)) throw cause;

    throw new ApiError("The API request could not be completed.", {
      kind: "network",
      cause,
    });
  }

  let decodedResponse: unknown;
  try {
    decodedResponse = await decodeJsonResponse(response);
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    if (response.status === 503) throw createServiceUnavailableError(cause);
    throw cause;
  }

  if (!response.ok) {
    if (!isApiErrorEnvelope(decodedResponse)) {
      if (response.status === 503) {
        throw createServiceUnavailableError();
      }

      throw new ApiError("The API returned a malformed error response.", {
        kind: "malformed-response",
        status: response.status,
      });
    }

    throw new ApiError(decodedResponse.error.message, {
      kind: "http",
      status: response.status,
      code: decodedResponse.error.code,
      details: decodedResponse.error.details,
    });
  }

  if (
    preparedRequest.expectedStatuses &&
    !preparedRequest.expectedStatuses.includes(response.status)
  ) {
    throw new ApiError("The API returned an unexpected response status.", {
      kind: "http",
      status: response.status,
    });
  }

  return decodedResponse as T | undefined;
}

function createApiClient(
  config: ApiConfig,
  getToken: ApiTokenProvider,
  fetchImplementation: FetchImplementation = globalThis.fetch,
  { onAuthenticationFailure, sessionId }: ApiClientOptions = {},
): ApiClient {
  let clientTokenRefreshPromise: Promise<string | null> | undefined;
  let clientUserProvisioningPromise:
    | Promise<ProvisioningRecoveryResult>
    | undefined;
  let clientAuthenticationFailurePromise: Promise<void> | undefined;

  function refreshSessionToken(): Promise<string | null> {
    const existingRefreshPromise =
      sessionId === undefined
        ? clientTokenRefreshPromise
        : tokenRefreshPromises.get(sessionId);
    if (existingRefreshPromise) return existingRefreshPromise;

    const refreshPromise = getSessionTokenValue(getToken, {
      skipCache: true,
    }).finally(() => {
      if (sessionId === undefined) {
        clientTokenRefreshPromise = undefined;
        return;
      }

      tokenRefreshPromises.delete(sessionId);
    });

    if (sessionId === undefined) {
      clientTokenRefreshPromise = refreshPromise;
    } else {
      tokenRefreshPromises.set(sessionId, refreshPromise);
    }

    return refreshPromise;
  }

  function notifyAuthenticationFailure(): Promise<void> {
    if (!onAuthenticationFailure) return Promise.resolve();
    const existingFailurePromise =
      sessionId === undefined
        ? clientAuthenticationFailurePromise
        : authenticationFailurePromises.get(sessionId);
    if (existingFailurePromise) return existingFailurePromise;

    const failurePromise = Promise.resolve()
      .then(() => onAuthenticationFailure())
      .finally(() => {
        if (sessionId === undefined) {
          if (clientAuthenticationFailurePromise === failurePromise) {
            clientAuthenticationFailurePromise = undefined;
          }
          return;
        }

        if (authenticationFailurePromises.get(sessionId) === failurePromise) {
          authenticationFailurePromises.delete(sessionId);
        }
      });
    if (sessionId === undefined) {
      clientAuthenticationFailurePromise = failurePromise;
    } else {
      authenticationFailurePromises.set(sessionId, failurePromise);
    }

    return failurePromise;
  }

  async function refreshAfterUnauthenticated(
    state: RequestRecoveryState,
    authenticationError: ApiError,
  ): Promise<string> {
    if (state.tokenRefreshUsed) {
      await notifyAuthenticationFailure();
      throw authenticationError;
    }

    state.tokenRefreshUsed = true;

    let freshToken: string | null;
    try {
      freshToken = await refreshSessionToken();
    } catch (refreshError) {
      if (isAbortError(refreshError)) throw refreshError;
      await notifyAuthenticationFailure();
      throw refreshError;
    }

    if (!freshToken) {
      await notifyAuthenticationFailure();
      throw authenticationError;
    }

    return freshToken;
  }

  async function provisionWithRecovery(
    initialToken: string,
    state: RequestRecoveryState,
    provisioningRequest: PreparedApiRequest,
  ): Promise<ProvisioningRecoveryResult> {
    let provisioningToken = initialToken;
    let transientFailureCount = 0;

    while (true) {
      try {
        await sendAuthenticatedRequest(
          provisioningRequest,
          provisioningToken,
          fetchImplementation,
        );
        return {
          token: provisioningToken,
          tokenRefreshUsed: state.tokenRefreshUsed,
        };
      } catch (error) {
        if (isExactUnauthenticatedError(error)) {
          provisioningToken = await refreshAfterUnauthenticated(state, error);
          continue;
        }

        if (shouldRetryProvisioning(transientFailureCount, error)) {
          transientFailureCount += 1;
          continue;
        }

        throw error;
      }
    }
  }

  function getUserProvisioningPromise(
    initialToken: string,
    state: RequestRecoveryState,
    provisioningRequest: PreparedApiRequest,
  ): Promise<ProvisioningRecoveryResult> {
    const existingProvisioningPromise =
      sessionId === undefined
        ? clientUserProvisioningPromise
        : userProvisioningPromises.get(sessionId);
    if (existingProvisioningPromise) return existingProvisioningPromise;

    const provisioningPromise = provisionWithRecovery(
      initialToken,
      state,
      provisioningRequest,
    ).finally(() => {
      if (sessionId === undefined) {
        clientUserProvisioningPromise = undefined;
        return;
      }

      userProvisioningPromises.delete(sessionId);
    });

    if (sessionId === undefined) {
      clientUserProvisioningPromise = provisioningPromise;
    } else {
      userProvisioningPromises.set(sessionId, provisioningPromise);
    }

    return provisioningPromise;
  }

  async function request<T>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<T | undefined> {
    const {
      body,
      headers: requestHeaders,
      expectedStatuses,
      method: requestMethod = "GET",
      replayAfterProvisioning,
      ...fetchOptions
    } = options;
    fetchOptions.signal?.throwIfAborted();
    const url = buildUserScopedUrl(config, path);
    const token = await getSessionToken(getToken);
    fetchOptions.signal?.throwIfAborted();
    const serializedBody =
      body === undefined ? undefined : JSON.stringify(body);
    const normalizedMethod = requestMethod.toUpperCase();
    const canRecoverProvisioning = !isUserProvisioningRequest(
      path,
      normalizedMethod,
    );
    const shouldReplay =
      isSafeReplayMethod(normalizedMethod) || replayAfterProvisioning === true;
    const preparedRequest: PreparedApiRequest = {
      url,
      method: requestMethod,
      serializedBody,
      requestHeaders,
      expectedStatuses,
      fetchOptions,
    };
    const preparedProvisioningRequest: PreparedApiRequest = {
      url: buildUserScopedUrl(config, ""),
      method: "PUT",
      serializedBody: undefined,
      expectedStatuses: [200, 201],
      fetchOptions,
    };
    const recoveryState: RequestRecoveryState = {
      tokenRefreshUsed: false,
      provisioningUsed: false,
    };

    async function sendRequestWithRecovery(
      requestToken: string,
    ): Promise<T | undefined> {
      try {
        return await sendAuthenticatedRequest<T>(
          preparedRequest,
          requestToken,
          fetchImplementation,
        );
      } catch (error) {
        if (isExactUnauthenticatedError(error)) {
          const freshToken = await refreshAfterUnauthenticated(
            recoveryState,
            error,
          );
          return sendRequestWithRecovery(freshToken);
        }

        if (!canRecoverProvisioning || !isExactUserNotProvisionedError(error)) {
          throw error;
        }

        if (recoveryState.provisioningUsed) {
          throw createAccountLinkingError(error);
        }

        recoveryState.provisioningUsed = true;
        let provisioningResult: ProvisioningRecoveryResult;
        try {
          provisioningResult = await getUserProvisioningPromise(
            requestToken,
            recoveryState,
            preparedProvisioningRequest,
          );
        } catch (repairError) {
          if (isAbortError(repairError)) throw repairError;
          throw createProvisioningRepairError(error, repairError);
        }
        recoveryState.tokenRefreshUsed ||= provisioningResult.tokenRefreshUsed;

        if (!shouldReplay) {
          throw createProvisioningRetryRequiredError(error);
        }

        return sendRequestWithRecovery(provisioningResult.token);
      }
    }

    return sendRequestWithRecovery(token);
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: "GET" }),
    post: (path, body, options) =>
      request(path, { ...options, body, method: "POST" }),
    put: (path, body, options) =>
      request(path, { ...options, body, method: "PUT" }),
    patch: (path, body, options) =>
      request(path, { ...options, body, method: "PATCH" }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" }),
  };
}

export { ApiError, createApiClient, isAbortError };
export type {
  ApiClient,
  ApiGetClient,
  ApiErrorCode,
  ApiErrorDetail,
  ApiErrorKind,
  ApiAuthenticationFailureHandler,
  ApiClientOptions,
  ApiRequestOptions,
  ApiRequestOptionsWithoutBody,
  ApiTokenOptions,
  ApiTokenProvider,
};
